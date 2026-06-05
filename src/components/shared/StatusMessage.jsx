export default function StatusMessage({ message }) {
  if (!message) return null;

  return (
    <div className="mt-4 px-4 py-3 bg-luna-accent-primary/10 border-l-3 border-luna-accent-primary rounded-lg text-luna-accent-primary font-medium">
      {message}
    </div>
  );
}
