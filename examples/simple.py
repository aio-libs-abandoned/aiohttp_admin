"""Minimal example with simple database models.

When running this file, admin will be accessible at /admin.
"""

from datetime import datetime

from aiohttp import web
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import aiohttp_admin
from aiohttp_admin.backends.sqlalchemy import SAResource
from _auth import DummyAuthPolicy, check_credentials, identity_callback
from _models import Base, SimpleChild, SimpleParent

async def create_app() -> web.Application:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session = async_sessionmaker(engine, expire_on_commit=False)

    # Create some sample data
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with session.begin() as sess:
        sess.add(SimpleParent(num=5, value="first"))
        p = SimpleParent(num=82, optional_num=12, value="with child")
        sess.add(p)
    async with session.begin() as sess:
        sess.add(SimpleChild(id=p.id, date=datetime(2023, 2, 13, 19, 4)))

    app = web.Application()

    # This is the setup required for aiohttp-admin.
    schema = {
        "security": {
            "check_credentials": check_credentials,
            "identity_callback": identity_callback,
            "secure": False
        },
        "resources": (
            {"model": SAResource(engine, SimpleParent)},
            {"model": SAResource(engine, SimpleChild)}
        )
    }
    aiohttp_admin.setup(app, schema, DummyAuthPolicy())

    return app

if __name__ == "__main__":
    web.run_app(create_app())