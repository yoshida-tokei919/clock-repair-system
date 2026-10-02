import PartsForm from '@/components/parts/PartsForm'
export default async function EditPartsPage({ params }: { params: Promise<{ id: string }> }) {
  return <PartsForm partId={Number((await params).id)} />
}
