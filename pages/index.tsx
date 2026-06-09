import Head from 'next/head';
import { HomeClient } from '../components/HomeClient';

const eventName = process.env.NEXT_PUBLIC_EVENT_NAME || 'QR Scavenger Hunt';

export default function HomePage() {
  return (
    <>
      <Head>
        <title>{eventName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <HomeClient />
    </>
  );
}
