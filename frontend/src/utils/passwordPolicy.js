// The password rule the server enforces (employee/service.validate_password_policy).
export const PASSWORD_HINT = "At least 8 characters, with a letter and a number.";

/** null when the password is acceptable, otherwise the message to show. */
export function passwordProblem(value) {
  if (!value || value.length < 8 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) return PASSWORD_HINT;
  return null;
}
