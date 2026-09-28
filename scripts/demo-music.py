"""Synthesises an original soundtrack for the demo video, timed to its sections. No samples, no third-party audio.

    python3 scripts/demo-music.py OUT.wav --length 74.0 --marks 0,7.6,22.7,29.2,42.1,51.1,56.7,63.7,70.6

Marks are the video times where each section starts: title, inspect, pull, propagation, run, explain, reset/Walmart,
the moment the JPMorgan machine appears (the impact lands there), end card. Requires numpy.
"""
import argparse, wave
import numpy as np

SR = 44100
BPM = 96
BEAT = 60 / BPM
A = 440.0
note = lambda n: A * 2 ** ((n - 69) / 12)          # MIDI note → Hz
# A minor: Am – F – C – G, one chord per bar
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
BASS = [45, 41, 48, 43]


def env(n, attack, release):
    e = np.ones(n)
    a, r = int(attack * SR), int(release * SR)
    if a: e[:a] = np.linspace(0, 1, a)
    if r: e[-r:] *= np.linspace(1, 0, r)
    return e


def lowpass(x, cutoff):
    # One-pole low-pass; cutoff may be a scalar or a per-sample array.
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    k = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc += k[i] * (x[i] - acc); y[i] = acc
    return y


def saw(f, t):
    return 2 * (t * f % 1) - 1


def main():
    p = argparse.ArgumentParser()
    p.add_argument('out'); p.add_argument('--length', type=float, required=True); p.add_argument('--marks', required=True)
    a = p.parse_args()
    m = [float(x) for x in a.marks.split(',')]
    title, inspect, pull, prop, run, explain, reset, jpm, end = m
    L = int(a.length * SR); t = np.arange(L) / SR
    out = np.zeros((L, 2))

    def level(points):
        """Piecewise-linear automation from (time, value) pairs."""
        xs, ys = zip(*points); return np.interp(t, xs, ys)

    def add(sig, start, gain=1.0, pan=0.0):
        s = int(start * SR)
        if s >= L: return
        sig = sig[: L - s]
        out[s:s + len(sig), 0] += sig * gain * (1 - pan) / 2 * 2 ** .5
        out[s:s + len(sig), 1] += sig * gain * (1 + pan) / 2 * 2 ** .5

    bar = 4 * BEAT
    chord_at = lambda time: int(time // bar) % 4

    # Pad: detuned saws through a slowly opening filter, one chord per bar.
    pad = np.zeros(L)
    for b in range(int(a.length / bar) + 1):
        # Each chord rings on past the bar line so neighbouring chords crossfade instead of dipping.
        s, n = int(b * bar * SR), int((bar + .6) * SR)
        seg = np.arange(n) / SR
        tone = sum(saw(note(k) * d, seg) for k in CHORDS[b % 4] for d in (1, 1.004, .996)) / 9
        tone += .5 * np.sin(2 * np.pi * note(CHORDS[b % 4][0] - 12) * seg)
        chunk = (tone * env(n, .5, .6))[: max(0, L - s)]
        pad[s:s + len(chunk)] += chunk
    pad = lowpass(pad, level([(0, 500), (prop, 1400), (run, 2600), (explain, 900), (reset, 1600), (jpm, 3200), (end, 700), (a.length, 400)]))
    pad *= level([(0, 0), (1.5, .55), (end, .55), (a.length, 0)])
    add(pad, 0, .9)

    # Arpeggio: plucked sines on eighth notes, alternating across the stereo field.
    arp_gain = level([(0, 0), (inspect, 0), (inspect + 1, .28), (pull, .22), (prop, .34), (run, .4), (explain, .3), (reset, .36), (jpm, .45), (end, .15), (a.length, 0)])
    for i in range(int(a.length / (BEAT / 2))):
        at = i * BEAT / 2; c = CHORDS[chord_at(at)]
        k = [c[0] + 12, c[1] + 12, c[2] + 12, c[1] + 24][i % 4]
        n = int(.5 * SR); seg = np.arange(n) / SR
        pluck = (np.sin(2 * np.pi * note(k) * seg) + .3 * np.sin(4 * np.pi * note(k) * seg)) * np.exp(-seg * 7)
        g = arp_gain[min(L - 1, int(at * SR))]
        if g > 0: add(pluck, at, g, -.35 if i % 2 else .35)

    # Bass: sine with a soft envelope on every beat once the propagation starts.
    bass_gain = level([(0, 0), (prop - .1, 0), (prop, .5), (explain, .5), (explain + .5, 0), (reset + 2, 0), (reset + 3, .45), (jpm, .6), (end, 0), (a.length, 0)])
    for i in range(int(a.length / BEAT)):
        at = i * BEAT; g = bass_gain[min(L - 1, int(at * SR))]
        if g <= 0: continue
        n = int(BEAT * SR); seg = np.arange(n) / SR
        f = note(BASS[chord_at(at)])
        add((np.sin(2 * np.pi * f * seg) + .25 * np.sin(4 * np.pi * f * seg)) * env(n, .01, .25) * np.exp(-seg * 2), at, g)

    # Kick on every beat, hats on the off-beats, in the energetic sections.
    kick_gain = level([(0, 0), (prop - .1, 0), (prop, .8), (explain, .8), (explain + .3, 0), (reset + 2, 0), (reset + 3, .7), (jpm, .95), (end, 0), (a.length, 0)])
    hat_gain = level([(0, 0), (run - .1, 0), (run, .16), (explain, .16), (explain + .3, 0), (jpm - .1, 0), (jpm, .2), (end, 0), (a.length, 0)])
    rng = np.random.default_rng(7)
    for i in range(int(a.length / BEAT)):
        at = i * BEAT; kg = kick_gain[min(L - 1, int(at * SR))]
        if kg > 0:
            n = int(.35 * SR); seg = np.arange(n) / SR
            freq = 45 + 75 * np.exp(-seg * 30)
            add(np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-seg * 9), at, kg)
        hg = hat_gain[min(L - 1, int((at + BEAT / 2) * SR))]
        if hg > 0:
            n = int(.06 * SR); noise = rng.standard_normal(n)
            hat = np.diff(noise, prepend=0) * np.exp(-np.arange(n) / SR * 60)
            add(hat, at + BEAT / 2, hg, .25)

    # Risers into the propagation and into JPMorgan; an impact as the bank machine lands.
    for start, stop in ((pull + 1, prop), (reset + 2.5, jpm)):
        n = int((stop - start) * SR); seg = np.arange(n) / SR; k = seg / seg[-1]
        noise = lowpass(rng.standard_normal(n), 300 + 5000 * k ** 2)
        tone = np.sin(2 * np.pi * np.cumsum(220 + 660 * k ** 2) / SR)
        add((noise * .5 + tone * .25) * k ** 2, start, .45)
    n = int(3.5 * SR); seg = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-seg * 12)) / SR) * np.exp(-seg * 1.6)
    crash = lowpass(rng.standard_normal(n), 4000) * np.exp(-seg * 2.5)
    add(boom * .9 + crash * .25, jpm + .2, .9)  # the frame lands just after the DOM does

    # A final resolving A-minor chord under the end card.
    n = int((a.length - end) * SR); seg = np.arange(n) / SR
    chord = sum(np.sin(2 * np.pi * note(k) * seg) for k in (45, 57, 60, 64, 69)) / 5
    add(chord * env(n, .8, 2.2), end, .5)

    # Space: a stereo feedback delay, then gentle saturation and peak normalisation.
    for ch, d in ((0, .31), (1, .37)):
        dly = int(d * SR); y = out[:, ch].copy()
        for rep in range(1, 5): y[dly * rep:] += out[: L - dly * rep, ch] * (.28 ** rep)
        out[:, ch] = y
    out = np.tanh(out * 1.3)
    out *= .89 / np.max(np.abs(out))
    fade = int(.02 * SR); out[:fade] *= np.linspace(0, 1, fade)[:, None]

    with wave.open(a.out, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((out * 32767).astype('<i2').tobytes())
    print(f'{a.out}: {a.length:.1f}s')


if __name__ == '__main__':
    main()
