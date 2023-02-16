import {
    Admin, Create, Datagrid, Edit, EditButton, List, HttpError, Resource, SimpleForm,
    SimpleShowLayout, Show,
    BooleanField, BooleanInput,
    DateField, DateInput,
    NumberField, NumberInput,
    ReferenceField, ReferenceInput,
    TextField, TextInput
} from "react-admin";

const _body = document.querySelector("body");
const STATE = JSON.parse(_body.dataset.state);
// Create a mapping of components, so we can reference them by name later.
const COMPONENTS = {BooleanField, DateField, NumberField, ReferenceField, TextField,
                    BooleanInput, DateInput, NumberInput, ReferenceInput, TextInput};

/** Make an authenticated API request and return the response object. */
function apiRequest(url, options) {
    const headers = new Headers({
        Accept: "application/json",
        Authorization: localStorage.getItem("identity")
    });
    return fetch(url, Object.assign({"headers": headers}, options)).then((resp) => {
        if (resp.status < 200 || resp.status >= 300) {
            return resp.text().then(text => {
                throw new HttpError(resp.statusText, resp.status, text);
            });
        }
        return resp;
    });
}

/** Make a dataProvider request to the given resource's endpoint and return the JSON result. */
function dataRequest(resource, endpoint, params) {
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined)
            delete params[k];
        if (typeof v === "object" && v !== null)
            params[k] = JSON.stringify(v);
    }
    const query = new URLSearchParams(params).toString();

    const [method, url] = STATE["resources"][resource]["urls"][endpoint];
    return apiRequest(`${url}?${query}`, {"method": method}).then((resp) => resp.json());
}


const dataProvider = {
    create: (resource, params) => dataRequest(resource, "create", params),
    delete: (resource, params) => dataRequest(resource, "delete", params),
    deleteMany: (resource, params) => dataRequest(resource, "delete_many", params),
    getList: (resource, params) => dataRequest(resource, "get_list", params),
    getMany: (resource, params) => dataRequest(resource, "get_many", params),
    getOne: (resource, params) => dataRequest(resource, "get_one", params),
    update: (resource, params) => dataRequest(resource, "update", params),
}

const authProvider = {
    login: ({username, password}) => {
        const body = JSON.stringify({username, password});
        return apiRequest(STATE["urls"]["token"], {"method": "POST", "body": body}, true).then((resp) => {
            localStorage.setItem("identity", resp.headers.get("X-Token"));
        });
    },
    logout: () => {
        return apiRequest(STATE["urls"]["logout"], {"method": "DELETE"}, true).then((resp) => {
            localStorage.removeItem("identity");
        });
    },
    checkAuth: () => {
        return localStorage.getItem("identity") ? Promise.resolve() : Promise.reject();
    },
    checkError: (error) => {
        return error.status === 401 ?  Promise.reject() : Promise.resolve();
    },
    getIdentity: () => {
        return Promise.resolve(JSON.parse(localStorage.getItem("identity")));
    },
    getPermissions: () => {
        const identity = JSON.parse(localStorage.getItem("identity"));
        return Promise.resolve(identity ? identity["permissions"] : []);
    },
};


function createFields(resource, display_only=false) {
    let components = [];
    for (const [field, state] of Object.entries(resource["fields"])) {
        if (display_only && !resource["display"].includes(field))
            continue;
        const C = COMPONENTS[state["type"]];
        if (C === undefined)
            throw Error(`Unknown component '${state["type"]}'`);
        components.push(<C source={field} {...state["props"]} />);
    }
    return components;
}

function createInputs(resource, create=false) {
    let components = [];
    for (const [field, state] of Object.entries(resource["inputs"])) {
        if (create && !state["show_create"])
            continue;
        const C = COMPONENTS[state["type"]];
        if (C === undefined)
            throw Error(`Unknown component '${state["type"]}'`);
        components.push(<C source={field} {...state["props"]} />);
    }
    return components;
}

const AiohttpList = (resource) => (
    <List filters={createInputs(resource)}>
        <Datagrid rowClick="show">
            {createFields(resource, true)}
            <EditButton />
        </Datagrid>
    </List>
);

const AiohttpShow = (resource) => (
    <Show>
        <SimpleShowLayout>
            {createFields(resource)}
        </SimpleShowLayout>
    </Show>
);

const AiohttpEdit = (resource) => (
    <Edit>
        <SimpleForm>
            {createInputs(resource)}
        </SimpleForm>
    </Edit>
);

const AiohttpCreate = (resource) => (
    <Create>
        <SimpleForm>
            {createInputs(resource, true)}
        </SimpleForm>
    </Create>
);

function createResources(resources) {
    let components = [];
    for (const [name, r] of Object.entries(resources)) {
        components.push(<Resource
            name={name}
            create={AiohttpCreate(r)}
            edit={AiohttpEdit(r)}
            list={AiohttpList(r)}
            show={AiohttpShow(r)}
            recordRepresentation={r["repr"]}
        />);
    }
    return components;
}

const App = () => (
    <Admin dataProvider={dataProvider} authProvider={authProvider} disableTelemetry>
        {createResources(STATE["resources"])}
    </Admin>
);

export default App;