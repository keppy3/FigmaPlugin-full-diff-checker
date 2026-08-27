// Wraps figma.clientStorage for the one thing the main thread needs to
// persist: the user's Figma personal access token, scoped per plugin+user
// so it survives across plugin re-launches without asking every time.

const TOKEN_KEY = 'full-diff-checker.pat';

export async function loadToken(): Promise<string | null> {
  const value = await figma.clientStorage.getAsync(TOKEN_KEY);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function saveToken(token: string): Promise<void> {
  await figma.clientStorage.setAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await figma.clientStorage.setAsync(TOKEN_KEY, '');
}
