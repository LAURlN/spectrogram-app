#!/usr/bin/env python3
"""
Real-Time 2D Spectrogram in Python
-----------------------------------
Captures microphone input using sounddevice and NumPy, then plots a scrolling
2D spectrogram in real-time using Matplotlib.

Requirements:
    pip install sounddevice numpy matplotlib scipy
"""

import sys
import time

try:
    import sounddevice as sd
    import numpy as np
    import matplotlib.pyplot as plt
    from matplotlib.animation import FuncAnimation
except ImportError as e:
    missing_pkg = str(e).split()[-1].replace("'", "")
    print(f"[ERROR] Missing required Python package: {missing_pkg}")
    print("\nPlease install required packages by running:")
    print("    pip install sounddevice numpy matplotlib scipy\n")
    sys.exit(1)

# --- Configuration Settings ---
SAMPLE_RATE = 44100       # Audio sampling rate in Hz
WINDOW_SIZE = 2048        # FFT window size (number of audio samples per frame)
HOP_SIZE = 512            # Number of new audio samples per frame (scroll step)
NUM_FRAMES = 150          # Number of time frames visible on the X-axis
COLORMAP = 'viridis'      # Options: 'viridis', 'inferno', 'plasma', 'magma', 'rainbow'
MAX_FREQ = 12000          # Upper frequency bound for visualization (Hz)

# Calculate frequency resolution
NYQUIST = SAMPLE_RATE / 2
FREQ_BINS = WINDOW_SIZE // 2 + 1
FREQUENCIES = np.linspace(0, NYQUIST, FREQ_BINS)

# Mask for upper frequency bound
VALID_FREQ_MASK = FREQUENCIES <= MAX_FREQ
PLOT_FREQUENCIES = FREQUENCIES[VALID_FREQ_MASK]
NUM_VALID_BINS = len(PLOT_FREQUENCIES)

# Initialize 2D Spectrogram Buffer Matrix: shape (frequencies, time_frames)
spectrogram_data = np.full((NUM_VALID_BINS, NUM_FRAMES), -100.0)

# Ring buffer for audio stream input
audio_buffer = np.zeros(WINDOW_SIZE)
hanning_window = np.hanning(WINDOW_SIZE)

def audio_callback(indata, frames, time_info, status):
    """Callback function called by sounddevice for each new audio block from microphone."""
    global audio_buffer, spectrogram_data
    if status:
        print(f"[Audio Warning] {status}", file=sys.stderr)
    
    # Flatten audio input block
    new_samples = indata[:, 0]
    
    # Shift audio buffer and append new samples
    audio_buffer = np.roll(audio_buffer, -len(new_samples))
    audio_buffer[-len(new_samples):] = new_samples

    # Apply Hanning window & Compute FFT magnitude
    windowed_samples = audio_buffer * hanning_window
    fft_complex = np.fft.rfft(windowed_samples)
    fft_magnitude = np.abs(fft_complex)

    # Convert magnitude to Decibels (dB) with log scaling
    # Prevent log(0) using a small epsilon
    fft_db = 20 * np.log10(fft_magnitude + 1e-6)

    # Filter to selected frequency bound
    fft_db_valid = fft_db[VALID_FREQ_MASK]

    # Shift spectrogram image left and insert new frame on the right
    spectrogram_data = np.roll(spectrogram_data, -1, axis=1)
    spectrogram_data[:, -1] = fft_db_valid

def main():
    print("=" * 60)
    print(" Real-Time 2D Spectrogram (Python)")
    print(f" Sample Rate: {SAMPLE_RATE} Hz | Window: {WINDOW_SIZE} | Hop: {HOP_SIZE}")
    print(f" Max Freq: {MAX_FREQ} Hz | Colormap: {COLORMAP}")
    print(" Close the figure window to exit.")
    print("=" * 60)

    # Set up Matplotlib figure and axis
    fig, ax = plt.subplots(figsize=(10, 6), facecolor='#090c15')
    ax.set_facecolor('#030509')

    # Initial plot rendering with imshow
    # extent = [x_min, x_max, y_min, y_max]
    time_extent_sec = (NUM_FRAMES * HOP_SIZE) / SAMPLE_RATE
    img = ax.imshow(
        spectrogram_data,
        aspect='auto',
        origin='lower',
        extent=[-time_extent_sec, 0, 0, MAX_FREQ / 1000.0],
        cmap=COLORMAP,
        vmin=-80,
        vmax=0
    )

    # Labels and Styling
    ax.set_title('Real-Time 2D Microphone Spectrogram', color='#f0f4fc', fontsize=14, pad=12, fontweight='bold')
    ax.set_xlabel('Time History (seconds)', color='#8b9bb4', fontsize=11)
    ax.set_ylabel('Frequency (kHz)', color='#8b9bb4', fontsize=11)

    ax.tick_params(colors='#8b9bb4', labelsize=10)
    for spine in ax.spines.values():
        spine.set_color('#202c42')

    # Colorbar
    cbar = fig.colorbar(img, ax=ax, pad=0.02)
    cbar.set_label('Power Level (dB)', color='#8b9bb4', fontsize=11)
    cbar.ax.tick_params(colors='#8b9bb4', labelsize=9)

    plt.tight_layout()

    # Animation update function
    def update_frame(frame):
        img.set_data(spectrogram_data)
        return [img]

    # Start audio input stream
    try:
        with sd.InputStream(
            channels=1,
            samplerate=SAMPLE_RATE,
            blocksize=HOP_SIZE,
            callback=audio_callback
        ):
            print("\nMicrophone stream active. Rendering live 2D spectrogram...")
            anim = FuncAnimation(fig, update_frame, interval=30, blit=True, cache_frame_data=False)
            plt.show()
    except Exception as err:
        print(f"\n[ERROR] Failed to start audio stream: {err}")
        print("Please ensure your microphone is connected and not locked by another application.")

if __name__ == "__main__":
    main()
