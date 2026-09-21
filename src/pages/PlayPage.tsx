import { PageSurface } from '../components/PageSurface';

interface PlayPageProps {
  route: 'play' | 'table' | 'bots';
}

export function PlayPage({ route }: PlayPageProps) {
  return <PageSurface page={route} />;
}
