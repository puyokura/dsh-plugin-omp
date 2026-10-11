/**
 * @module dsh-plugin-omp
 * Cordis plugin for dsh-TUI (dst) to:
 * 1. Import and bridge OMP conversations into DSH session store.
 * 2. Browse and resume OMP sessions seamlessly from within dst.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const name = 'omp-bridge'
export const inject = ['commands']

/** Get user home directory */
function getHomeDir() {
  return process.env.USERPROFILE || process.env.HOME || os.homedir()
}

/** Get dsh-tui preferences directory (~/.dsh-tui) */
function getDshTuiDir() {
  return path.join(getHomeDir(), '.dsh-tui')
}

/** Get omp sessions directory (~/.omp/agent/sessions) */
function getOmpSessionsDir() {
  return path.join(getHomeDir(), '.omp', 'agent', 'sessions')
}

/** Locate dsh-tui CLI entry point */
function findDshTuiBin() {
  const candidates = [
    path.join(getHomeDir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@deepseek-harness-tui', 'dsh-tui', 'bin', 'dsh-tui.js'),
    path.join(getHomeDir(), 'Desktop', 'dsh-TUI', 'bin', 'dsh-tui.js'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

/** Execute migration via official dsh-tui migrate omp command */
async function runOmpMigration(dryRun = false) {
  const bin = findDshTuiBin()
  if (!bin) {
    return { ok: false, error: 'dsh-tui.js not found' }
  }
  const args = [bin, 'migrate', 'omp']
  if (dryRun) args.push('--dry-run')

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    })
    const output = (stdout + '\n' + stderr).trim()
    const importedMatch = output.match(/imported\s+(\d+)\s*·\s*already\s+present\s+(\d+)/i)
    const wouldImportMatch = output.match(/(\d+)\s+conversation\(s\)\s+would\s+be\s+imported/i)

    return {
      ok: true,
      raw: output,
      imported: importedMatch ? parseInt(importedMatch[1], 10) : 0,
      alreadyPresent: importedMatch ? parseInt(importedMatch[2], 10) : 0,
      wouldImport: wouldImportMatch ? parseInt(wouldImportMatch[1], 10) : 0,
    }
  } catch (err) {
    return {
      ok: false,
      error: err.message || String(err),
      raw: (err.stdout || '') + '\n' + (err.stderr || ''),
    }
  }
}

/** Scan OMP session directories and extract session metadata */
function scanOmpSessions(limit = 20) {
  const baseDir = getOmpSessionsDir()
  if (!fs.existsSync(baseDir)) return []

  const results = []

  function walk(dir, depth) {
    if (depth > 3) return
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1)
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try {
          const stat = fs.statSync(fullPath)
          if (stat.size > 64 * 1024 * 1024) continue

          // Read header & turns
          const content = fs.readFileSync(fullPath, 'utf8')
          const lines = content.split('\n')
          let title = ''
          let cwd = ''
          let startedAt = stat.mtimeMs
          let messageCount = 0

          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const obj = JSON.parse(line)
              if (!obj || typeof obj !== 'object') continue
              if (obj.type === 'session' || obj.type === 'title') {
                if (obj.title) title = obj.title
                if (obj.cwd) cwd = obj.cwd
                if (obj.timestamp) {
                  const t = Date.parse(obj.timestamp)
                  if (!isNaN(t)) startedAt = t
                }
              } else if (obj.type === 'message') {
                messageCount++
              }
            } catch {
              continue
            }
          }

          const fileBase = path.basename(entry.name, '.jsonl')
          const idMatch = fileBase.match(/_([0-9a-zA-Z-]+)$/)
          const sessionId = idMatch ? idMatch[1] : fileBase

          results.push({
            id: sessionId,
            file: fullPath,
            title: title || '（無題のセッション）',
            cwd: cwd || '（不明）',
            messageCount,
            mtime: stat.mtimeMs,
            startedAt,
          })
        } catch {
          // Ignore unreadable files
        }
      }
    }
  }

  walk(baseDir, 0)

  // Sort by mtime descending (most recent first)
  results.sort((a, b) => b.mtime - a.mtime)
  return results.slice(0, limit)
}


/** Format help text */
function formatHelp() {
  return [
    '### OMP 会話連携 (`/omp`)',
    '',
    '| コマンド | 説明 |',
    '| :--- | :--- |',
    '| `/omp` または `/omp list` | OMP の最新会話一覧を表示 |',
    '| `/omp import` | OMP の会話をすべて DSH / dst にインポート |',
    '| `/omp status` | OMP 会話ディレクトリの状態と統計を確認 |',
    '| `/omp help` | このヘルプを表示 |',
    '',
    '> **ヒント**: インポートされた会話は dst の `/resume` コマンドから通常通りディレクトリ別に開いて再開・継続できます。',
  ].join('\n')
}

/** Format status text */
async function formatStatus() {
  const ompDir = getOmpSessionsDir()
  const exists = fs.existsSync(ompDir)
  const probe = await runOmpMigration(true)

  return [
    '### OMP 会話連携ステータス (`/omp status`)',
    '',
    `- **OMPセッション保存先**: \`${ompDir}\``,
    `- **ディレクトリ検出**: ${exists ? '検出済み (OK)' : '未検出'}`,
    probe.ok
      ? `- **利用可能なOMP会話**: ${probe.wouldImport || 0} 件`
      : `- **検出エラー**: ${probe.error}`,
    '',
    '> 新しい会話を取り込むには `/omp import` を実行してください。',
  ].join('\n')
}

/** Format list text */
function formatList(sessions) {
  if (sessions.length === 0) {
    return [
      '### OMP 会話一覧 (`/omp list`)',
      '',
      'OMP の会話が見つかりませんでした。OMP で会話を実行した後に再度お試しください。',
    ].join('\n')
  }

  const rows = sessions.map((s, idx) => {
    const dateStr = new Date(s.mtime).toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    const cwdClean = s.cwd.replace(/\\/g, '/')
    return `| ${idx + 1} | \`${s.id.slice(0, 8)}\` | ${s.title} | ${s.messageCount} 発言 | \`${cwdClean}\` | ${dateStr} |`
  })

  return [
    '### OMP 最新会話一覧 (`/omp list`)',
    '',
    '| # | ID | タイトル | メッセージ | 作業ディレクトリ | 更新日時 |',
    '| :---: | :--- | :--- | :---: | :--- | :--- |',
    ...rows,
    '',
    '> **会話の再開方法**: `/resume` を実行すると、インポート済みの全セッションから選択して直接再開できます。',
    '> 最新の会話が反映されていない場合は `/omp import` でインポートしてください。',
  ].join('\n')
}

/** Format import result text */
function formatImportResult(res) {
  if (!res.ok) {
    return [
      '### OMP 会話インポート失敗 (`/omp import`)',
      '',
      `エラー: ${res.error}`,
      res.raw ? `\`\`\`\n${res.raw}\n\`\`\`` : '',
    ].join('\n')
  }

  return [
    '### OMP 会話インポート完了 (`/omp import`)',
    '',
    `- **新規インポート**: ${res.imported} 件`,
    `- **既存（スキップ）**: ${res.alreadyPresent} 件`,
    '',
    'インポートされた会話は `/resume` コマンドで作業ディレクトリ別に表示・再開できます。',
  ].join('\n')
}

/** Cordis plugin entry point */
export function apply(ctx) {
  // 1. Run background sync silently on startup
  runOmpMigration(false).catch(() => {})

  // 2. Register /omp slash command
  ctx.effect(function* () {
    yield ctx.commands.register({
      definitionId: 'dsh-plugin-omp',
      name: 'omp',
      description: 'OMP 会話連携 (/omp list | import | status | help)',
      handler: async (invocation) => {
        const args = invocation.rawInput.trim().split(/\s+/).filter(Boolean)
        const sub = args[0]?.toLowerCase() || 'list'

        let chatText = ''

        if (sub === 'help') {
          chatText = formatHelp()
        } else if (sub === 'status' || sub === 'info') {
          chatText = await formatStatus()
        } else if (sub === 'import' || sub === 'sync') {
          const res = await runOmpMigration(false)
          chatText = formatImportResult(res)
        } else if (sub === 'list' || sub === 'ls') {
          const sessions = scanOmpSessions(20)
          chatText = formatList(sessions)
        } else {
          chatText = `### 不明なコマンド\n\n\`/omp ${sub}\` は存在しません。\n\n${formatHelp()}`
        }

        return {
          kind: 'success',
          text: chatText,
        }
      },
    })
  }, 'dsh-plugin-omp command')
}
