import { ExternalLink, Film, BookOpen } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export function MediaPage() {
  const { data, update, isParent } = useApp();
  const { embyUrl, komgaUrl, embedMedia } = data.settings;

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Media Hub</h1>
        {isParent && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={embedMedia}
              onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, embedMedia: e.target.checked } }))}
            />
            Embed in page
          </label>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <Film className="w-6 h-6 text-indigo-500" />
            </div>
            <div>
              <h2 className="font-semibold">Emby</h2>
              <p className="text-xs text-muted truncate max-w-[200px]">{embyUrl || 'Not configured'}</p>
            </div>
          </div>
          {embyUrl ? (
            embedMedia ? (
              <iframe title="Emby" src={embyUrl} className="w-full h-64 rounded-xl border border-border-strong bg-black" />
            ) : (
              <a href={embyUrl} target="_blank" rel="noreferrer">
                <Button className="w-full">
                  Open Emby <ExternalLink className="w-4 h-4" />
                </Button>
              </a>
            )
          ) : (
            <p className="text-sm text-muted">Set Emby URL in Settings.</p>
          )}
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h2 className="font-semibold">Komga</h2>
              <p className="text-xs text-muted truncate max-w-[200px]">{komgaUrl || 'Not configured'}</p>
            </div>
          </div>
          {komgaUrl ? (
            embedMedia ? (
              <iframe title="Komga" src={komgaUrl} className="w-full h-64 rounded-xl border border-border-strong bg-black" />
            ) : (
              <a href={komgaUrl} target="_blank" rel="noreferrer">
                <Button className="w-full" variant="secondary">
                  Open Komga <ExternalLink className="w-4 h-4" />
                </Button>
              </a>
            )
          ) : (
            <p className="text-sm text-muted">Set Komga URL in Settings.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
