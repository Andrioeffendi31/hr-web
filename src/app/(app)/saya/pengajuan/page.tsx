import { Pengajuan } from "./pengajuan";

export const metadata = { title: "Pengajuan — NanumHR" };

/**
 * Like /saya, this hands over to a client component instead of querying drizzle.
 *
 * `GET /api/me/requests` already assembles everything this page needs — the leave
 * balance, the delegate list, and both histories with the raw fields a revision
 * has to reopen — behind one ownership rule. Re-deriving that here would mean
 * duplicating an aliased join, `leaveBalances()`, the delegate query and two
 * mappers, and then keeping both copies in step forever.
 */
export default function PengajuanPage() {
  return <Pengajuan />;
}
