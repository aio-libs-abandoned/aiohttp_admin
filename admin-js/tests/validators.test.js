import {within} from "@testing-library/dom";
import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

global.pythonProcessPath = "examples/validators.py";


test("validators work", async () => {
    await userEvent.click((await screen.findAllByLabelText("Edit"))[0]);
    await waitFor(() => screen.getByRole("link", {"name": "List"}));

    const main = screen.getByRole("main");
    const edit = main.querySelector("form");

    const votes = within(edit).getByLabelText("Votes *");
    await userEvent.clear(votes);
    await userEvent.type(votes, "4");
    const email = within(edit).getByLabelText("Email");
    await userEvent.type(email, "foobar");
    const username = within(edit).getByLabelText("Username *");
    await userEvent.type(username, "123");
    await userEvent.click(within(edit).getByRole("button", {"name": "Save"}));

    expect(votes).toBeInvalid();
    expect(email).toBeInvalid();
    expect(username).toBeInvalid();

    expect(votes).toHaveAccessibleErrorMessage("Votes must be an odd number");
    expect(within(form).getByText("Votes must be an odd number")).toBeInTheDocument();
    expect(within(form).getByText("Must be a valid email")).toBeInTheDocument();
    expect(within(form).getByText("Must match a specific format (regexp): [object Object]")).toBeInTheDocument();
});
