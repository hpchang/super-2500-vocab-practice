import { isSpeechSupported, speak } from '@/lib/speak';

interface Props {
  /** The English word/phrase to pronounce. */
  text: string;
  /** Larger size for prompt area, smaller for feedback area. */
  size?: 'lg' | 'sm';
  /** Optional label shown next to the icon. */
  label?: string;
  /** Accessibility label. */
  ariaLabel?: string;
}

export function SpeakerButton({ text, size = 'lg', label, ariaLabel }: Props) {
  if (!isSpeechSupported()) return null;
  const cls = `speaker-btn speaker-${size}`;
  return (
    <button
      className={cls}
      onClick={() => speak(text)}
      aria-label={ariaLabel ?? `發音：${text}`}
      type="button"
    >
      <span className="speaker-icon" aria-hidden="true">🔊</span>
      {label && <span className="speaker-label">{label}</span>}
    </button>
  );
}