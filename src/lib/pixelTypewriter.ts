type Callback = (line: HTMLElement, index: number, char?: string) => void;

export type TypewriterOptions = {
  interval?: number;
  lineDelay?: number;
  preserveOnStop?: boolean;
  onLineStart?: Callback;
  onLineComplete?: Callback;
  onCharacter?: Callback;
};

export type TypewriterController = {
  play: () => void;
  stop: () => void;
  reset: () => void;
};

/**
 * Creates a lightweight multi-line typewriter animation controller.
 */
export const createTypewriter = (
  lines: HTMLElement[],
  options: TypewriterOptions = {},
): TypewriterController => {
  const interval = options.interval ?? 36;
  const lineDelay = options.lineDelay ?? 320;
  const storedTexts = lines.map((line) => line.dataset.text ?? line.textContent ?? "");
  storedTexts.forEach((text, idx) => {
    lines[idx].dataset.text = text;
  });

  let timers: number[] = [];
  let playing = false;

  const clearTimers = () => {
    timers.forEach((id) => window.clearTimeout(id));
    timers = [];
  };

  const reset = () => {
    clearTimers();
    lines.forEach((line) => {
      line.textContent = "";
    });
  };

  const stop = () => {
    playing = false;
    clearTimers();
    if (!options.preserveOnStop) {
      lines.forEach((line) => {
        line.textContent = "";
      });
    }
  };

  const play = () => {
    reset();
    playing = true;
    let delay = 0;
    lines.forEach((line, index) => {
      const text = storedTexts[index];
      const startDelay = delay;
      timers.push(
        window.setTimeout(() => {
          if (!playing) return;
          options.onLineStart?.(line, index);
        }, startDelay),
      );
      for (let i = 0; i < text.length; i += 1) {
        const charDelay = startDelay + i * interval;
        timers.push(
          window.setTimeout(() => {
            if (!playing) return;
            line.textContent += text[i];
            options.onCharacter?.(line, index, text[i]);
          }, charDelay),
        );
      }
      const finishDelay = startDelay + text.length * interval;
      timers.push(
        window.setTimeout(() => {
          if (!playing) return;
          options.onLineComplete?.(line, index);
        }, finishDelay),
      );
      delay += text.length * interval + lineDelay;
    });
  };

  return {
    play,
    stop,
    reset,
  };
};

