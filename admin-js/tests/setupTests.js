const http = require("http");
const {spawn} = require("child_process");
import "whatwg-fetch";  // https://github.com/jsdom/jsdom/issues/1724
import "@testing-library/jest-dom";
import failOnConsole from "jest-fail-on-console";
import {memoryStore} from "react-admin";
import {configure, render, screen} from "@testing-library/react";
import * as structuredClone from "@ungap/structured-clone";

const {App} = require("../src/App");

let pythonProcess;
let STATE;

jest.setTimeout(300000);  // 5 mins
configure({"asyncUtilTimeout": 10000});
jest.mock("react-admin", () => {
    const originalModule = jest.requireActual("react-admin");
    return {
        ...originalModule,
        downloadCSV: jest.fn(),  // Mock downloadCSV to test export button.
    };
});

// https://github.com/jsdom/jsdom/issues/3363#issuecomment-1387439541
global.structuredClone = structuredClone.default;

// To render full-width
window.matchMedia = (query) => ({
    matches: true,
    addListener: () => {},
    removeListener: () => {}
});

// Ignore not implemented errors
window.scrollTo = jest.fn();


global.sleep = (delay_s) => new Promise((resolve) => setTimeout(resolve, delay_s * 1000));

failOnConsole({
    silenceMessage: (msg) => {
        return (
            // Suppress act() warnings, because there's too many async changes happening.
            msg.includes("inside a test was not wrapped in act(...).")
            // Error in react-admin which doesn't actually break anything.
            // https://github.com/marmelab/react-admin/issues/8849
            || msg.includes("Fetched record's id attribute")
            || msg.includes("The above error occurred in the <EditBase> component")
        );
    }
});

beforeAll(async() => {
    if (!global.pythonProcessPath)
        return;

    if (global.__coverage__)
        pythonProcess = spawn("coverage", ["run", "--append", "--source=examples/,aiohttp_admin/", global.pythonProcessPath], {"cwd": ".."});
    else
        pythonProcess = spawn("python3", ["-u", global.pythonProcessPath], {"cwd": ".."});

    pythonProcess.stderr.on("data", (data) => {console.error(`stderr: ${data}`);});
    //pythonProcess.stdout.on("data", (data) => {console.log(`stdout: ${data}`);});

    // Wait till server accepts requests
    await new Promise(resolve => {
        const cutoff = Date.now() + 10000;
        function alive() {
            http.get("http://localhost:8080/", resolve).on("error", e => Date.now() < cutoff && setTimeout(alive, 100));
        }
        alive();
    });

    await new Promise(resolve => {
        http.get("http://localhost:8080/admin", resp => {
            if (resp.statusCode !== 200)
                throw new Error("Request failed");

            let html = "";
            resp.on("data", (chunk) => { html += chunk; });
            resp.on("end", () => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, "text/html");
                STATE = JSON.parse(doc.querySelector("body").dataset.state);
                if (STATE["js_module"] !== null)
                    STATE["js_module"] = "http://localhost:8080/admin" + STATE["js_module"];
                resolve();
            });
        });
    });
}, 10000);

afterAll(() => {
    if (pythonProcess)
        pythonProcess.kill("SIGINT");
});


let login = {"username": "admin", "password": "admin"};
global.setLogin = (username, password) => { login = {username, password}; };

beforeEach(async () => {
    location.href = "/";
    localStorage.clear();

    if (STATE) {
        const resp = await fetch("http://localhost:8080/admin/token", {"method": "POST", "body": JSON.stringify(login)});
        localStorage.setItem("identity", resp.headers.get("X-Token"));
        render(<App aiohttpState={STATE} store={memoryStore()} />);
        const profile = await screen.findByText(login["username"], {"exact": false});
        expect(profile).toHaveAccessibleName("Profile");
    }
});
