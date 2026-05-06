import QueryString from 'qs';

export function queryStringParser(searchString: string) {
  return QueryString.parse(searchString, {
    ignoreQueryPrefix: true,
  });
}
