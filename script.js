const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

let socket;
let localStream;
let peerConnection;
let peerId;
let isAudioEnabled = true;
let isVideoEnabled = true;

const startBtn = document.getElementById("startBtn");
const connectBtn = document.getElementById("connectBtn");
const endBtn = document.getElementById("endBtn");
const toggleAudioBtn = document.getElementById("toggleAudio");
const toggleVideoBtn = document.getElementById("toggleVideo");
const statusBadge = document.getElementById("statusBadge");
const statusText = document.getElementById("status");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

function updateStatus(message, isConnected = false) {
  statusText.textContent = message;
  statusBadge.classList.toggle("connected", isConnected);
}

function toggleAudio() {
  if (localStream) {
    isAudioEnabled = !isAudioEnabled;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = isAudioEnabled;
    });
    toggleAudioBtn.innerHTML = `<i class="fas fa-microphone${
      isAudioEnabled ? "" : "-slash"
    }"></i>`;
    toggleAudioBtn.classList.toggle("active", !isAudioEnabled);
  }
}

function toggleVideo() {
  if (localStream) {
    isVideoEnabled = !isVideoEnabled;
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = isVideoEnabled;
    });
    toggleVideoBtn.innerHTML = `<i class="fas fa-video${
      isVideoEnabled ? "" : "-slash"
    }"></i>`;
    toggleVideoBtn.classList.toggle("active", !isVideoEnabled);
  }
}

function initializeSocket() {
  socket = io("https://hirewise-backend-jcub.onrender.com");

  socket.on("connect", () => {
    updateStatus("Connected to server", true);
    connectBtn.disabled = false;
  });

  socket.on("peer_found", async ({ peerId: foundPeerId }) => {
    peerId = foundPeerId;
    updateStatus("Peer found! Creating connection...", true);
    await createPeerConnection();
  });

  socket.on("offer", async (data) => {
    if (!peerConnection) {
      await createPeerConnection();
    }
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.sdp)
    );
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("answer", { sdp: answer });
  });

  socket.on("answer", async (data) => {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(data.sdp)
    );
  });

  socket.on("ice_candidate", (data) => {
    if (data.candidate) {
      peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  });

  socket.on("peer_disconnected", () => {
    updateStatus("Peer disconnected", false);
    endCall();
  });
}

async function createPeerConnection() {
  peerConnection = new RTCPeerConnection(configuration);

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice_candidate", { candidate: event.candidate });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    updateStatus(
      `Connection state: ${peerConnection.connectionState}`,
      peerConnection.connectionState === "connected"
    );
  };
  endBtn.disabled = false;
  if (socket.id < peerId) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("offer", { sdp: offer });
  }
}

function endCall() {
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
  // Refresh the page
  location.reload();
}

startBtn.addEventListener("click", async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: true,
    });
    localVideo.srcObject = localStream;
    startBtn.disabled = true;
    toggleAudioBtn.disabled = false;
    toggleVideoBtn.disabled = false;
    initializeSocket();
  } catch (error) {
    console.error("Error accessing media devices:", error);
    updateStatus("Camera/mic access denied", false);
  }
});

connectBtn.addEventListener("click", () => {
  socket.emit("find_peer");
  connectBtn.disabled = true;

  updateStatus("Looking for peer...", false);
});

toggleAudioBtn.addEventListener("click", toggleAudio);
toggleVideoBtn.addEventListener("click", toggleVideo);
endBtn.addEventListener("click", endCall);

window.addEventListener("beforeunload", () => {
  endCall(); // Clean up resources when leaving the page
});
