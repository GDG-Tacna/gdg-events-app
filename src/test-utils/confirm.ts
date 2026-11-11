import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Answers the app's confirmation dialog (`ConfirmDialog`), the one that replaced the browser's `confirm`: «confirm»
 * presses its confirm button (the last one), «cancel» presses «Cancelar». Waits for the dialog to be there.
 */
export async function answerConfirm(answer: "confirm" | "cancel"): Promise<void> {
  const dialog = await screen.findByRole("dialog");
  const buttons = within(dialog).getAllByRole("button");
  const button = answer === "cancel" ? within(dialog).getByRole("button", { name: "Cancelar" }) : buttons[buttons.length - 1];
  await userEvent.click(button);
}
