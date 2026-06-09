import Head from 'next/head';
import { AdminClient } from '../components/AdminClient';

export default function AdminPage() {
  return (
    <>
      <Head>
        <title>Admin · QR Scavenger Hunt</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <AdminClient />
    </>
  );
}
