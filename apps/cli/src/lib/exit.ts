export function fail(message: string, code = 1): never {
  process.stderr.write(`error: ${message}\n`)
  process.exit(code)
}
