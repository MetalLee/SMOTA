const protectedPrefixes = ["/dashboard", "/resource", "/my-projects", "/projects", "/runs", "/share"];

export function isProtectedPath(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
