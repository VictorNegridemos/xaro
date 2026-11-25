// npm run set-password [-- --generate [--out <file>]] [-- --rotate-secret] [-- --env-path <file>]   (plan 5.5)
//   (no flag)           : asks for the new password twice (hidden input), writes AUTH_PASSWORD_HASH to .env.local
//                         and prints the variable lines to copy into Vercel. Never prints the password.
//   --generate          : generates a password and prints it once.
//   --generate --out F  : writes the generated password to F and prints nothing secret.
//   --rotate-secret     : also replaces SESSION_SECRET (logs everyone out; not needed for a password change).
//   --env-path F        : the env file to edit (default .env.local).
// SESSION_SECRET is added when it is absent. Only the lines of these two variables are touched.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { applyPassword } from '../src/lib/auth/env-file'
import { generatePassword } from '../src/lib/auth/generate'
import { canonicalPassword } from '../src/lib/auth/password'
import { runScript } from './lib/env'

const MIN_LENGTH = 12
const MAX_LENGTH = 200

interface Options { generate: boolean; rotateSecret: boolean; out: string | null; envFile: string }

function parseArgs(argv: string[]): Options {
  const options: Options = { generate: false, rotateSecret: false, out: null, envFile: '.env.local' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const value = (): string => {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} needs a file path`)
      i += 1
      return next
    }
    if (arg === '--generate') options.generate = true
    else if (arg === '--rotate-secret') options.rotateSecret = true
    else if (arg === '--out') options.out = value()
    else if (arg === '--env-path') options.envFile = value()
    else throw new Error(`Unknown argument "${arg}". Allowed: --generate, --out <file>, --rotate-secret, --env-path <file>`)
  }
  if (options.out !== null && !options.generate) throw new Error('--out is only valid together with --generate')
  return options
}

/** Reads one line from the terminal without echoing it. */
function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    process.stdout.write(prompt)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    const finish = (error?: Error): void => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off('data', onData)
      process.stdout.write('\n')
      if (error) reject(error)
      else resolve(value)
    }
    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish()
        if (char === '\u0003' || char === '\u0004') return finish(new Error('cancelled'))
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1)
        else if (char >= ' ') value += char
      }
    }
    stdin.on('data', onData)
  })
}

async function askPassword(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('No terminal for the hidden prompt. Run it in a terminal, or use --generate.')
  }
  const first = await readHidden('New password (input hidden; spaces and hyphens are ignored): ')
  const length = canonicalPassword(first).length
  if (length < MIN_LENGTH) throw new Error(`The password needs at least ${MIN_LENGTH} characters (not counting spaces and hyphens).`)
  if (first.length > MAX_LENGTH) throw new Error(`The password may have at most ${MAX_LENGTH} characters.`)
  const second = await readHidden('Repeat the password: ')
  if (canonicalPassword(first) !== canonicalPassword(second)) throw new Error('The two entries differ. Nothing was changed.')
  return first
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const password = options.generate ? generatePassword() : await askPassword()
  // The password file is written BEFORE the hash, so a failure can never leave a hash whose password is lost.
  if (options.generate && options.out !== null) {
    mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true })
    writeFileSync(options.out, `${password}\n`, { mode: 0o600 })
  }
  const result = await applyPassword(options.envFile, password, { rotateSecret: options.rotateSecret })

  console.log(`${options.envFile}: ${result.createdFile ? 'created' : 'updated'} — AUTH_PASSWORD_HASH written, SESSION_SECRET ${result.secretWritten ? 'written (new)' : 'kept'}.`)
  if (result.secretWritten) console.log('A new SESSION_SECRET ends every existing session.')
  else console.log('The new password hash ends every existing session.')

  if (options.generate && options.out !== null) {
    console.log(`Generated password written to ${options.out} (keep that file out of git; delete it once the password is stored safely).`)
    console.log(`For Vercel: copy the AUTH_PASSWORD_HASH and SESSION_SECRET lines from ${options.envFile}.`)
    return
  }

  if (options.generate) {
    console.log('\nGenerated password (shown once; hyphens are optional when typing it):\n')
    console.log(`  ${password}\n`)
  }
  console.log('Set these two variables in Vercel (Project → Settings → Environment Variables), then redeploy:\n')
  console.log(`AUTH_PASSWORD_HASH=${result.hash}`)
  console.log(`SESSION_SECRET=${result.secret}`)
  console.log('\nRestart a running dev server so it picks up the new values.')
}

runScript(main)
