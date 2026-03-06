export const FORM_SAVED_KEY = "bl_form_data_v1";

export function encodeState(obj: any) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeState(b64: string) {
  try {
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
