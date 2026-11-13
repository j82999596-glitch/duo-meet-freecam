const statusEl = document.querySelector("#status");
const joinBtn = document.querySelector("#join");
const video = document.querySelector("#local");
const roomId = new URL(location.href).searchParams.get("room");
let pc, ws, localStream;

if (!roomId || !/^[a-f0-9]{36}$/.test(roomId)) {
  statusEl.textContent = "This invite link is invalid.";
} else {
  statusEl.textContent = "Invite ready. Click Join room.";
  joinBtn.disabled = false;
}

function signal(type, data={}) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type,...data}));
}
async function start() {
  joinBtn.disabled = true;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({video:true,audio:true});
    video.srcObject = localStream;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/signal?room=${roomId}`);
    pc = new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.onicecandidate = e => { if (e.candidate) signal("ice",{candidate:e.candidate}); };
    ws.onopen = () => { statusEl.textContent = "Connected to room. Waiting for your friend…"; signal("ready"); };
    ws.onmessage = async e => {
      const m = JSON.parse(e.data);
      if (m.type === "peer-joined") {
        // The extension-side peer initiates the offer.
        statusEl.textContent = "Your friend is connecting…";
      } else if (m.type === "offer") {
        await pc.setRemoteDescription(m.description);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal("answer",{description:pc.localDescription});
        statusEl.textContent = "Connected! Keep this tab open.";
      } else if (m.type === "ice" && m.candidate) {
        try { await pc.addIceCandidate(m.candidate); } catch {}
      } else if (m.type === "peer-left") {
        statusEl.textContent = "Your friend disconnected.";
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") statusEl.textContent = "Connected! Keep this tab open.";
      if (["failed","disconnected","closed"].includes(pc.connectionState)) statusEl.textContent = "Connection lost. Refresh and rejoin.";
    };
  } catch (err) {
    statusEl.textContent = `Could not start camera/microphone: ${err.message}`;
    joinBtn.disabled = false;
  }
}
joinBtn.addEventListener("click", start);
window.addEventListener("beforeunload", () => { localStream?.getTracks().forEach(t=>t.stop()); pc?.close(); ws?.close(); });
