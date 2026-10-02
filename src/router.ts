import { useEffect, useState } from 'preact/hooks';

export function currentPath(): string {
  return location.hash.replace(/^#/, '') || '/';
}

export function navigate(path: string): void {
  location.hash = path;
}

export function useRoute(): string {
  const [path, setPath] = useState(currentPath());
  useEffect(() => {
    const onChange = () => setPath(currentPath());
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return path;
}
