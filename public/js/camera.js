/* =========================================================
   CAMERA FUNCTIONS
   ========================================================= */
async function startCamera() {
  if (!cameraView) return;

  try {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
    });

    cameraView.srcObject = stream;
    currentStream = stream;
    
    cameraView.onloadedmetadata = () => {
      cameraView.play();
    };
  } catch (err) {
    console.error('Camera error:', err);
    showMessage('Cannot access camera. Please check permissions.', false);
  }
}

function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
}

async function takePhoto() {
  if (!cameraView || !cameraOutput || !timerText) return;
  
  let countdown = 3;
  timerText.textContent = countdown;

  const timer = setInterval(() => {
    countdown--;
    timerText.textContent = countdown > 0 ? countdown : '';
    
    if (countdown <= 0) {
      clearInterval(timer);
      
      setTimeout(() => {
        const canvas = document.createElement('canvas');
        canvas.width = cameraView.videoWidth;
        canvas.height = cameraView.videoHeight;
        const context = canvas.getContext('2d');
        context.drawImage(cameraView, 0, 0, canvas.width, canvas.height);

        capturedPhotoData = canvas.toDataURL('image/jpeg', 0.9);
        
        cameraOutput.src = capturedPhotoData;
        cameraOutput.classList.remove('hidden');
        cameraView.classList.add('hidden');
        cameraCaptureBtn.classList.add('hidden');
        cameraRetakeBtn.classList.remove('hidden');
        timerText.textContent = '';
        
        showMessage('Photo captured! You can retake if needed.', true);
      }, 200);
    }
  }, 1000);
}

function retakePhoto() {
  cameraOutput.classList.add('hidden');
  cameraView.classList.remove('hidden');
  cameraCaptureBtn.classList.remove('hidden');
  cameraRetakeBtn.classList.add('hidden');
  capturedPhotoData = null;
  timerText.textContent = '';
  startCamera();
}

