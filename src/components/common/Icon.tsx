import spriteRaw from '../../../assets/icons.svg?raw';
import { cn } from '../../lib/cn';

/**
 * The legacy app loads assets/icons.svg as a sprite at runtime. We bundle it
 * once and inject it here so `<use href="#icon-…">` keeps working unchanged.
 */
export function IconSprite(): JSX.Element {
  return <div style={{ display: 'none' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: spriteRaw }} />;
}

interface IconProps {
  name: string;
  className?: string;
}

export function Icon({ name, className }: IconProps): JSX.Element {
  return (
    <svg className={cn('icon', className)} aria-hidden="true">
      <use href={`#icon-${name}`} />
    </svg>
  );
}
