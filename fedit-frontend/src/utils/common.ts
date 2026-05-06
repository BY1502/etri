export function isNumber(value: any) {
  return !!Number(value);
}

export function makePhoneNumber(str: string) {
  return `${str.substring(0, 3)}-${str.substring(3, 7)}-${str.substring(
    7,
    str.length,
  )}`;
}

export function makeContextIdWithVersion(contextId: string) {
  const index = contextId.indexOf('.jsonld');
  const contextIdWithVersion = `${contextId.slice(
    0,
    index,
  )}-v1.0.1${contextId.slice(index, contextId.length)}`;
  return contextIdWithVersion;
}
