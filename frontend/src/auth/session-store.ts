let csrfToken = "";

export function getCsrfToken() {
  return csrfToken;
}

export function setCsrfToken(value: string) {
  csrfToken = value;
}

export function clearCsrfToken() {
  csrfToken = "";
}
