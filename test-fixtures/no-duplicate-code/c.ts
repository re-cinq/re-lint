export function greet(name: string): string {
  return `hello ${name}`;
}

export function shout(name: string): string {
  return greet(name).toUpperCase();
}
