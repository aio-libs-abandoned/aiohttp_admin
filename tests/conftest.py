from collections.abc import Awaitable, Callable
from typing import Optional, Type
from unittest.mock import AsyncMock, create_autospec

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBaseNoMeta, Mapped, mapped_column

import aiohttp_admin
from _auth import check_credentials
from aiohttp_admin.backends.sqlalchemy import SAResource

IdentityCallback = Callable[[Optional[str]], Awaitable[aiohttp_admin.UserDetails]]

class Base(DeclarativeBaseNoMeta):
    """Base model."""

class DummyModel(Base):
    __tablename__ = "dummy"

    id: Mapped[int] = mapped_column(primary_key=True)

class Dummy2Model(Base):
    __tablename__ = "dummy2"

    id: Mapped[int] = mapped_column(primary_key=True)
    msg: Mapped[Optional[str]]

model = web.AppKey[type[DummyModel]]("model")
model2 = web.AppKey[type[Dummy2Model]]("model2")
db = web.AppKey("db", async_sessionmaker[AsyncSession])
admin = web.AppKey("admin", web.Application)


@pytest.fixture
def mock_engine() -> AsyncMock:
    return create_autospec(AsyncEngine, instance=True, spec_set=True)  # type: ignore[no-any-return] # noqa: B950


@pytest.fixture
def create_admin_client(
    aiohttp_client: Callable[[web.Application], Awaitable[TestClient]]
) -> Callable[[Optional[IdentityCallback]], Awaitable[TestClient]]:
    async def admin_client(identity_callback: Optional[IdentityCallback] = None) -> TestClient:
        app = web.Application()
        app[model] = DummyModel
        app[model2] = Dummy2Model
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        app[db] = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with app[db].begin() as sess:
            sess.add(DummyModel())
            sess.add(Dummy2Model(msg="Test"))
            sess.add(Dummy2Model(msg="Test"))
            sess.add(Dummy2Model(msg="Other"))

        schema: aiohttp_admin.Schema = {
            "security": {
                "check_credentials": check_credentials,
                "secure": False
            },
            "resources": (
                {"model": SAResource(engine, DummyModel)},
                {"model": SAResource(engine, Dummy2Model)}
            )
        }
        if identity_callback:
            schema["security"]["identity_callback"] = identity_callback
        app[admin] = aiohttp_admin.setup(app, schema)

        return await aiohttp_client(app)

    return admin_client


@pytest.fixture
async def admin_client(create_admin_client: Callable[[], Awaitable[TestClient]]) -> TestClient:
    return await create_admin_client()


@pytest.fixture
def login() -> Callable[[TestClient], Awaitable[dict[str, str]]]:
    async def do_login(admin_client: TestClient) -> dict[str, str]:
        assert admin_client.app
        url = admin_client.app[admin].router["token"].url_for()
        login = {"username": "admin", "password": "admin123"}
        async with admin_client.post(url, json=login) as resp:
            assert resp.status == 200
            token = resp.headers["X-Token"]

        return {"Authorization": token}

    return do_login
