/** what an account asks of a password: the one number the server
    enforces and the forms say before it is tried */
export const PASSWORD_MIN = 8;
export const passwordShort = () =>
  `A password needs ${PASSWORD_MIN} characters or more.`;
