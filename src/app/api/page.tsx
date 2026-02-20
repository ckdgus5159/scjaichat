// src/app/api/page.tsx
export const dynamic = "force-static";

export default function ApiIndexPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>/api</h1>
      <p>This path is for API endpoints.</p>
    </main>
  );
}
