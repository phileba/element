import * as findRoot from 'find-root'
import * as path from 'path'
import * as fs from 'fs'
import * as child_process from 'child_process'
import * as semver from 'semver'
import { sync as which } from 'which'
import { sync as mkdirp } from 'mkdirp'
import * as gitP from 'simple-git/promise'

const packageJSONFile = path.join(findRoot(path.join(__dirname, '..')), 'packages/cli/package.json')
const packageJSON = JSON.parse(fs.readFileSync(packageJSONFile, 'utf8'))
const version = packageJSON.version

const git = which('git')

const major = semver.major(version)
const minor = semver.minor(version)

const eltURL = `https://registry.npmjs.org/@flood/element-cli/-/element-cli-${version}.tgz`
const repo = 'https://github.com/flood-io/homebrew-taps.git'

const home = process.env.HOME
if (home === undefined) throw new Error('no $HOME set')
const tap = path.join(home, '.cache/flood-element/tap-tmp')

console.log('tap', tap)

const sum = child_process
	.execSync(`curl -sL ${eltURL} | shasum -a 256 -b`, { encoding: 'utf8' })
	.split(' ')[0]

const formula = versionSuffix => `
require "language/node"

class Element${versionSuffix} < Formula
  desc "Flood Element CLI"
  homepage "https://github.com/flood-io/element"
  url "https://registry.npmjs.org/@flood/element-cli/-/element-cli-${version}.tgz"
  sha256 "${sum}"

  depends_on "node"
  # uncomment if there is a native addon inside the dependency tree
  # depends_on "python" => :build

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    # add a meaningful test here
  end
end
`

const writeBrew = root => {
	fs.writeFileSync(path.join(root, `element.rb`), formula(''), 'utf8')
	fs.writeFileSync(
		path.join(root, `element@${major}.${minor}.rb`),
		formula(`AT${major}${minor}`),
		'utf8',
	)
}

async function update() {
	if (!fs.existsSync(tap)) {
		child_process.execSync(`${git} clone ${repo} -- ${tap}`, {
			cwd: tap,
			stdio: 'inherit',
		})
	} else {
		child_process.execSync(`${git} pull`, { cwd: tap, stdio: 'inherit' })
	}

	const root = path.join(tap, 'Formula')
	mkdirp(root)

	writeBrew(root)

	const sgit = gitP(tap)

	await sgit.add('Formula')
	const status = await sgit.status()
	if (status.files.length > 0) {
		await sgit.commit('published element brew tap')
		await sgit.push()
	}
}

update()
	.then(() => {
		console.log('done')
	})
	.catch(e => {
		console.error(e)
		process.exit(1)
	})
