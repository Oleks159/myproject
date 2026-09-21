import { PageSurface } from '../components/PageSurface';

interface FriendsPageProps {
  route: 'friends' | 'referrals';
}

export function FriendsPage({ route }: FriendsPageProps) {
  return <PageSurface page={route} />;
}
