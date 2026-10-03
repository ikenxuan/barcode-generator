import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { versionBump } from 'bumpp'

/**
 * 本地发版入口：`pnpm release`（流程沿用 amagi 的做法）
 *
 * 前置守卫：只允许在 main 上、工作区干净、且与远端同步时执行 —— 发版动作
 * 最终体现为一个 v* tag，tag 一旦推送就会触发 GitHub Actions 构建安装包并
 * 发布 Release，所以在错误的分支或脏工作区上误跑会在这里被拦下。
 *
 * 流程：bumpp 交互式选版本（只改文件，git 步骤手工编排，避免 bumpp 的
 * 「带路径提交」把钩子放临时索引里跑）→ 同步 tauri.conf.json 与 Cargo.toml
 * 的版本号 → 提交 `chore: release vX.Y.Z` → 打 `v*` tag → **停在这里**，
 * 推送交给人工。
 *
 * 推送刻意不自动化：脚本跑完后本地已有 commit + tag，先自行审计产物与提交
 * 内容，确认无误后手动：
 *   git push origin HEAD --follow-tags
 * tag 推上去之后由 .github/workflows/release.yml 接管：tauri-action 构建
 * 全平台安装包并发布 GitHub Release。
 */

const gitOut = (args: string[]): string =>
  execFileSync('git', args, { encoding: 'utf-8' }).trim()

// ---- 前置守卫 ----
const branch = gitOut(['rev-parse', '--abbrev-ref', 'HEAD'])
if (branch !== 'main') {
  console.error(`❌ 发版必须在 main 分支上进行（当前：${branch}）。先切回 main 再跑。`)
  process.exit(1)
}
if (gitOut(['status', '--porcelain']) !== '') {
  console.error('❌ 工作区有未提交改动。先提交或 stash，保持干净再发版。')
  process.exit(1)
}
execFileSync('git', ['fetch', 'origin', 'main'], { stdio: 'inherit' })
if (gitOut(['rev-parse', 'HEAD']) !== gitOut(['rev-parse', 'origin/main'])) {
  console.error('❌ 本地 main 与 origin/main 不同步。先 pull / push 对齐再发版。')
  process.exit(1)
}

// ---- 选版本（只改文件，不做 git 操作）----
await versionBump({
  files: ['src-tauri/tauri.conf.json'],
  commit: false,
  tag: false,
  push: false,
  confirm: true,
})

// 从文件读回版本号：确认环节取消时 bumpp 不写文件，这里直接退出
const { version } = JSON.parse(readFileSync('package.json', 'utf-8')) as {
  version: string
}
const headVersion = JSON.parse(
  execFileSync('git', ['show', 'HEAD:package.json'], { encoding: 'utf-8' }),
) as { version: string }
if (version === headVersion.version) {
  console.log('版本号未变化，已取消发版')
  process.exit(0)
}

// ---- 同步 Cargo.toml 的版本号（tauri.conf.json 已被 bumpp 同步）----
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf-8')
const synced = cargo.replace(
  /^version = ".*"$/m,
  `version = "${version}"`,
)
if (synced === cargo) {
  console.error('❌ 未能更新 src-tauri/Cargo.toml 的 version 字段，请手动检查。')
  process.exit(1)
}
const { writeFileSync } = await import('node:fs')
writeFileSync('src-tauri/Cargo.toml', synced)

// 同步 AppStream 元数据的版本与发布日期（应用中心「最新更新时间」）
const appdataPath = 'src-tauri/deb/appstream/bargen.appdata.xml'
const appdata = readFileSync(appdataPath, 'utf-8')
const today = new Date().toISOString().slice(0, 10)
const updatedAppdata = appdata.replace(
  /<release version="[^"]*" date="[^"]*"/,
  `<release version="${version}" date="${today}"`,
)
writeFileSync(appdataPath, updatedAppdata)

const tag = `v${version}`
execFileSync('git', ['add', 'package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/deb/appstream/bargen.appdata.xml'])
execFileSync('git', ['commit', '-m', `chore: release ${tag}`], { stdio: 'inherit' })
execFileSync('git', ['tag', tag])

console.log(`\n✅ 已提交并打上 ${tag}`)
console.log('   请审计提交内容与产物，确认无误后手动推送：')
console.log('   git push origin HEAD --follow-tags')
console.log('   （tag 推上去后 GitHub Actions 会自动构建并发布 Release）')
