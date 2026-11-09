import { useEffect } from 'react';
import { useTheme } from '@cropvision/theme-tokens/react';
import { useHubEvents } from './store/queries';
import { useUi } from './store/ui';
import { resolveShortcut } from './lib/shortcuts';
import { TopTelemetryBar } from './components/shell/TopTelemetryBar';
import { LeftActivityRail } from './components/shell/LeftActivityRail';
import { RightInspectorDock } from './components/shell/RightInspectorDock';
import { CommandMenu } from './components/shell/CommandMenu';
import { TooltipProvider } from './components/ui/tooltip';
import { MapView } from './features/gis-map/MapView';
import { ScoutingInspector } from './features/scouting/ScoutingInspector';
import { WorkOrders } from './features/work-orders/WorkOrders';
import { Irrigation } from './features/irrigation/Irrigation';
import { EdgeStudio } from './features/studio/EdgeStudio';

/** Spatial Command Center: fixed 100vw × 100vh, four zones, no page scroll (each zone scrolls itself). */
export function App() {
  useHubEvents();
  const module = useUi((s) => s.module);
  const scheme = useTheme().palette.scheme;
  useEffect(() => { document.documentElement.dataset.scheme = scheme; }, [scheme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = resolveShortcut(e);
      if (!s) return;
      e.preventDefault();
      const ui = useUi.getState();
      if (s.type === 'command') ui.setCommandOpen(!ui.commandOpen);
      else ui.setModule(s.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen w-screen select-none flex-col overflow-hidden bg-background text-foreground">
        <TopTelemetryBar />
        <div className="flex min-h-0 flex-1">
          <LeftActivityRail />
          <main className="relative min-w-0 flex-1 overflow-hidden">
            {/* the map stays mounted so its WebGL context survives module switches */}
            <div className={module === 'gis' ? 'h-full' : 'hidden'}><MapView /></div>
            {module === 'scouting' && <ScoutingInspector />}
            {module === 'hydraulic' && <Irrigation />}
            {module === 'ledger' && <WorkOrders />}
            {module === 'studio' && <EdgeStudio />}
          </main>
          <RightInspectorDock />
        </div>
      </div>
      <CommandMenu />
    </TooltipProvider>
  );
}
