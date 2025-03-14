const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

let socket;
let localStream;
let peerConnection;
let peerId;
let isConnected = false;
let isAudioEnabled = true;
let isVideoEnabled = true;

const mainButton = document.getElementById("mainButton");
const statusBadge = document.getElementById("statusBadge");
const statusText = document.getElementById("status");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const toggleAudioBtn = document.getElementById("toggleAudio");
const toggleVideoBtn = document.getElementById("toggleVideo");

function updateStatus(message, isConnected = false) {
  statusText.textContent = message;
  statusBadge.classList.toggle("connected", isConnected);
}

async function requestMediaPermissions() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: true,
    });

    // Ensure tracks are enabled by default
    localStream.getAudioTracks().forEach((track) => (track.enabled = true));
    localStream.getVideoTracks().forEach((track) => (track.enabled = true));

    // Assign stream to video element
    localVideo.srcObject = localStream;

    // Reset toggle states
    isAudioEnabled = true;
    isVideoEnabled = true;

    // Reset UI button states
    toggleAudioBtn.innerHTML = `<i class="fas fa-microphone"></i>`;
    toggleAudioBtn.classList.remove("active");

    toggleVideoBtn.innerHTML = `<i class="fas fa-video"></i>`;
    toggleVideoBtn.classList.remove("active");

    // Enable the toggle buttons
    toggleAudioBtn.disabled = false;
    toggleVideoBtn.disabled = false;

    return true;
  } catch (error) {
    console.error("Media access denied:", error);
    updateStatus("Camera/mic access denied", false);
    return false;
  }
}

function initializeSocket() {
  socket = io("http://192.168.133.68:3000");

  socket.on("connect", () => {
    updateStatus("Connected to server", true);
  });

  socket.on("peer_found", async ({ peerId: foundPeerId }) => {
    peerId = foundPeerId;
    updateStatus("Peer found! Connecting...", true);
    mainButton.textContent = "End";
    isConnected = true;
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
      `Connection: ${peerConnection.connectionState}`,
      peerConnection.connectionState === "connected"
    );
  };

  if (socket.id < peerId) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("offer", { sdp: offer });
  }
}

function endCall() {
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null; // Ensure old stream is removed
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (socket) {
    socket.emit("stop_finding_peer");
    socket.close();
    socket = null;
  }

  updateStatus("Not connected", false);
  mainButton.textContent = "Connect";
  isConnected = false;

  // Reset toggle button states
  toggleAudioBtn.disabled = true;
  toggleVideoBtn.disabled = true;

  isAudioEnabled = true;
  isVideoEnabled = true;
}

function toggleAudio() {
  if (localStream) {
    isAudioEnabled = !isAudioEnabled;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = isAudioEnabled;
    });

    // Update UI
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

    // Update UI
    toggleVideoBtn.innerHTML = `<i class="fas fa-video${
      isVideoEnabled ? "" : "-slash"
    }"></i>`;
    toggleVideoBtn.classList.toggle("active", !isVideoEnabled);
  }
}

mainButton.addEventListener("click", async () => {
  if (mainButton.textContent === "Connect") {
    const granted = await requestMediaPermissions();
    if (granted) {
      initializeSocket();
      socket.emit("find_peer");
      mainButton.textContent = "Stop";
      updateStatus("Looking for peer...", false);
    }
  } else if (mainButton.textContent === "Stop") {
    socket.emit("stop_finding_peer");
    mainButton.textContent = "Connect";
    updateStatus("Not connected", false);
  } else if (mainButton.textContent === "End") {
    endCall();
  }
});

toggleAudioBtn.addEventListener("click", toggleAudio);
toggleVideoBtn.addEventListener("click", toggleVideo);

window.addEventListener("beforeunload", () => {
  endCall();
});
