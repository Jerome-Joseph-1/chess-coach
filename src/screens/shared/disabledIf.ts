/** Spread into a Button: ButtonProps does not list `disabled`, although the button element takes it. */
export const disabledIf = (disabled: boolean) => ({ disabled });
