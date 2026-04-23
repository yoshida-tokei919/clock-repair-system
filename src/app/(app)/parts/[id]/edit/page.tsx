import PartsForm from '@/components/parts/PartsForm'
export default function EditPartsPage({ params }: { params: { id: string } }) {
  return <PartsForm partId={Number(params.id)} />
}
