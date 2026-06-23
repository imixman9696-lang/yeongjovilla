/**
 * 영조빌라 - 게임 전용 서버
 * RC카 서버(server/index.js)와 완전히 독립
 * 포트: 3456
 */

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { WebSocketServer } = require('ws');
const path       = require('path');
const fs         = require('fs');
const nodemailer = require('nodemailer');

// ── 이메일 설정 (Gmail 앱 비밀번호 사용) ──
// Gmail → 구글 계정 → 보안 → 2단계 인증 ON → 앱 비밀번호 생성
const MAIL_USER = process.env.MAIL_USER || '';   // 내 Gmail 주소
const MAIL_PASS = process.env.MAIL_PASS || '';   // 앱 비밀번호 (16자리)
const MAIL_TO   = process.env.MAIL_TO   || MAIL_USER; // 수신 주소

const transporter = MAIL_USER ? nodemailer.createTransport({
  service: 'gmail',
  auth: { user: MAIL_USER, pass: MAIL_PASS },
}) : null;

async function sendMail(subject, html) {
  if (!transporter) return;
  try {
    await transporter.sendMail({ from: MAIL_USER, to: MAIL_TO, subject, html, encoding: 'utf-8' });
    console.log(`📧 메일 발송: ${subject}`);
  } catch (e) { console.error('메일 발송 실패:', e.message); }
}

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

const PORT      = process.env.PORT || 3456;
const DATA_DIR  = path.join(__dirname, 'data');
const APPS_FILE = path.join(DATA_DIR, 'applications.json');
const MUSIC_FILE= path.join(DATA_DIR, 'music_requests.json');

// data 폴더 & 파일 초기화
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(APPS_FILE))  fs.writeFileSync(APPS_FILE,  '[]', 'utf8');
if (!fs.existsSync(MUSIC_FILE)) fs.writeFileSync(MUSIC_FILE, '[]', 'utf8');

// ── 정적 파일 서빙 (루트 디렉터리 전체) ──
app.use(express.static(__dirname));
app.use(express.json());

// ══════════════════════════════════════
// REST API
// ══════════════════════════════════════

// 참가 신청 제출
app.post('/api/apply', (req, res) => {
  const { name, count, date, time, message } = req.body;
  if (!name) return res.status(400).json({ error: '이름은 필수입니다' });

  const apps = JSON.parse(fs.readFileSync(APPS_FILE, 'utf8'));
  const entry = { id: Date.now(), name, count: count || '', date: date || '', time: time || '', message: message || '', createdAt: new Date().toISOString() };
  apps.push(entry);
  fs.writeFileSync(APPS_FILE, JSON.stringify(apps, null, 2), 'utf8');

  // 다른 플레이어들에게 알림 브로드캐스트
  broadcast({ type: 'notification', text: `🏠 ${name}님이 방문 신청을 했습니다!` });

  // 이메일 발송
  sendMail(`🏠 [영조빌라] ${name}님이 방문 신청했습니다`, `
    <meta charset="UTF-8">
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;background:#FFF7EE;border-radius:16px;">
      <h2 style="color:#E8855A;margin-bottom:16px;">🏠 새 방문 신청</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#9a8470;width:90px;">방문자 명</td><td style="padding:8px 0;font-weight:600;">${name}</td></tr>
        <tr><td style="padding:8px 0;color:#9a8470;">인원</td><td style="padding:8px 0;">${count || '-'}명</td></tr>
        <tr><td style="padding:8px 0;color:#9a8470;">방문 날짜</td><td style="padding:8px 0;">${date || '미정'}</td></tr>
        <tr><td style="padding:8px 0;color:#9a8470;">시간</td><td style="padding:8px 0;">${time || '미정'}</td></tr>
        <tr><td style="padding:8px 0;color:#9a8470;">메시지</td><td style="padding:8px 0;">${message || '-'}</td></tr>
        <tr><td style="padding:8px 0;color:#9a8470;">신청일</td><td style="padding:8px 0;">${new Date().toLocaleString('ko-KR')}</td></tr>
      </table>
    </div>
  `);

  res.json({ ok: true, entry });
});

// 음악 신청 제출
app.post('/api/music', (req, res) => {
  const { name, song, artist, message } = req.body;
  if (!name || !song) return res.status(400).json({ error: '이름과 곡명은 필수입니다' });

  const list = JSON.parse(fs.readFileSync(MUSIC_FILE, 'utf8'));
  const entry = { id: Date.now(), name, song, artist: artist || '', message: message || '', createdAt: new Date().toISOString() };
  list.push(entry);
  fs.writeFileSync(MUSIC_FILE, JSON.stringify(list, null, 2), 'utf8');

  broadcast({ type: 'notification', text: `🎵 ${name}님이 "${song}"을 신청했습니다!` });

  sendMail(`🎵 [영조빌라] ${name}님이 음악을 신청했습니다`, `
    <meta charset="UTF-8">
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;background:#F0F4FF;border-radius:16px;">
      <h2 style="color:#7B9FE0;margin-bottom:16px;">🎵 새 음악 신청</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#9a8470;width:80px;">신청자</td><td style="padding:8px 0;font-weight:600;">${name}</td></tr>
        <tr><td style="padding:8px 0;color:#9a8470;">곡명</td><td style="padding:8px 0;font-weight:600;">${song}</td></tr>
        <tr><td style="padding:8px 0;color:#9a8470;">아티스트</td><td style="padding:8px 0;">${artist || '-'}</td></tr>
        <tr><td style="padding:8px 0;color:#9a8470;">메시지</td><td style="padding:8px 0;">${message || '-'}</td></tr>
        <tr><td style="padding:8px 0;color:#9a8470;">신청일</td><td style="padding:8px 0;">${new Date().toLocaleString('ko-KR')}</td></tr>
      </table>
    </div>
  `);

  res.json({ ok: true, entry });
});

// 어드민 - 참가 신청 목록 조회
app.get('/admin/applications', (req, res) => {
  res.json(JSON.parse(fs.readFileSync(APPS_FILE, 'utf8')));
});

// 어드민 - 음악 신청 목록 조회
app.get('/admin/music', (req, res) => {
  res.json(JSON.parse(fs.readFileSync(MUSIC_FILE, 'utf8')));
});

// 어드민 페이지
app.get('/admin', (req, res) => {
  const apps  = JSON.parse(fs.readFileSync(APPS_FILE,  'utf8'));
  const music = JSON.parse(fs.readFileSync(MUSIC_FILE, 'utf8'));
  res.send(`<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<title>어드민 - 영조빌라</title>
<style>
  body { font-family: sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; background: #f5f5f5; }
  h1 { color: #333; } h2 { color: #555; margin-top: 30px; }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
  th { background: #4a9eff; color: white; padding: 10px 14px; text-align: left; }
  td { padding: 9px 14px; border-bottom: 1px solid #eee; }
  tr:last-child td { border-bottom: none; }
  .count { background: #4a9eff; color: white; border-radius: 12px; padding: 2px 10px; font-size: 13px; }
</style></head><body>
<h1>🏠 영조빌라 어드민</h1>
<h2>참가 신청 <span class="count">${apps.length}건</span></h2>
<table><tr><th>이름</th><th>방문 날짜</th><th>메시지</th><th>신청일</th></tr>
${apps.map(a=>`<tr><td>${a.name}</td><td>${a.date||'-'}</td><td>${a.message||'-'}</td><td>${a.createdAt.slice(0,10)}</td></tr>`).join('')}
</table>
<h2>음악 신청 <span class="count">${music.length}건</span></h2>
<table><tr><th>신청자</th><th>곡명</th><th>아티스트</th><th>메시지</th><th>신청일</th></tr>
${music.map(m=>`<tr><td>${m.name}</td><td>${m.song}</td><td>${m.artist||'-'}</td><td>${m.message||'-'}</td><td>${m.createdAt.slice(0,10)}</td></tr>`).join('')}
</table>
</body></html>`);
});

// ══════════════════════════════════════
// WebSocket 멀티플레이어
// ══════════════════════════════════════
const players = new Map(); // id → { ws, name, x, y, z, ry }

function broadcast(data, excludeId = null) {
  const msg = JSON.stringify(data);
  players.forEach((p, id) => {
    if (id !== excludeId && p.ws.readyState === 1) p.ws.send(msg);
  });
}

function genId() {
  return Math.random().toString(36).slice(2, 8);
}

wss.on('connection', (ws) => {
  const id = genId();
  console.log(`[연결] ${id}`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      // 접속 - 닉네임 설정
      case 'join': {
        const name = (msg.name || '익명').slice(0, 12);
        players.set(id, { ws, name, x: 0, y: 0, z: 0, ry: 0 });

        // 본인에게 환영 메시지 + 기존 플레이어 목록
        const others = {};
        players.forEach((p, pid) => {
          if (pid !== id) others[pid] = { name: p.name, x: p.x, y: p.y, z: p.z, ry: p.ry };
        });
        ws.send(JSON.stringify({ type: 'welcome', id, players: others }));

        // 다른 플레이어에게 입장 알림
        broadcast({ type: 'player_joined', id, name }, id);
        broadcast({ type: 'notification', text: `🐱 ${name}님이 입장했습니다!` }, id);
        console.log(`[입장] ${name} (${id}) — 현재 ${players.size}명`);
        break;
      }

      // 위치 업데이트 (10Hz 권장)
      case 'move': {
        const p = players.get(id);
        if (!p) break;
        p.x = msg.x; p.y = msg.y; p.z = msg.z; p.ry = msg.ry;
        p.anim = msg.anim || 'idle';
        broadcast({ type: 'player_moved', id, x: p.x, y: p.y, z: p.z, ry: p.ry, anim: p.anim }, id);
        break;
      }
    }
  });

  ws.on('close', () => {
    const p = players.get(id);
    if (p) {
      broadcast({ type: 'player_left', id });
      broadcast({ type: 'notification', text: `👋 ${p.name}님이 퇴장했습니다` });
      console.log(`[퇴장] ${p.name} (${id})`);
    }
    players.delete(id);
  });

  // 이름 입력 전 연결 상태 유지용 ping
  ws.send(JSON.stringify({ type: 'ping' }));
});

server.listen(PORT, () => {
  console.log(`\n🎮 영조빌라 서버 시작!`);
  console.log(`   게임:   http://localhost:${PORT}`);
  console.log(`   어드민: http://localhost:${PORT}/admin\n`);
});
