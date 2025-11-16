import { WebContainer } from '@webcontainer/api';
import { useEffect, useState, useRef } from 'react';

interface PreviewFrameProps {
  files: any[];
  webContainer: WebContainer | undefined;
}

export function PreviewFrame({ files: _files, webContainer }: PreviewFrameProps) {
  // The preview boots a WebContainer, installs dependencies and starts the dev server.
  // Installing can be slow — we await the install process, stream logs and show errors.
  const [url, setUrl] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const installedRef = useRef(false);
  const serverReadyRef = useRef<((port: number, url: string) => void) | null>(null);
  const urlRef = useRef("");

  function pushLog(line: string) {
    setLogs((prev) => {
      const next = prev.concat(line);
      // keep last 200 lines to avoid memory growth
      return next.slice(-200);
    });
  }

  async function streamProcessOutput(proc: any, label = '', onServerDetected?: (port: number) => void) {
    try {
      const decoder = new TextDecoder();
      await proc.output.pipeTo(new WritableStream({
        write(chunk) {
          // chunk may be Uint8Array
          const text = decoder.decode(chunk);
          pushLog(label + text);
          
          // Detect Node/Express server startup in logs
          if (onServerDetected && !urlRef.current) {
            // Look for patterns like "Server listening on http://localhost:3000" or "Listening on port 3000"
            const portMatch = text.match(/listening.*?[:\s]+(\d+)/i) || 
                             text.match(/port[:\s]+(\d+)/i) ||
                             text.match(/http:\/\/localhost:(\d+)/i);
            if (portMatch) {
              const port = parseInt(portMatch[1], 10);
              if (port > 0) {
                onServerDetected(port);
              }
            }
          }
        }
      }));
    } catch (err) {
      // pipeTo may throw when the stream closes; that's usually fine
      console.warn('streamProcessOutput error', err);
    }
  }

  async function main() {
    if (!webContainer) return;

    setLogs([]);
    setError(null);
    setUrl("");
    urlRef.current = "";

    try {
      // 1) install — only once per WebContainer instance
      if (!installedRef.current) {
        pushLog('> npm install\n');
        const installProcess = await webContainer.spawn('npm', ['install']);

        // stream install output into UI (don't await to allow UI updates)
        streamProcessOutput(installProcess, 'install: ');

        // wait for install to finish and check exit code
        const installExitCode = await installProcess.exit;
        pushLog(`> npm install exited with code ${installExitCode}\n`);
        if (installExitCode !== 0) {
          setError('npm install failed — check logs');
          return;
        }

        installedRef.current = true;
      } else {
        pushLog('> npm install skipped (already installed)\n');
      }

      // 2) start dev server
      pushLog('> npm run dev\n');
      const devProcess = await webContainer.spawn('npm', ['run', 'dev']);
      
      // Handler for when we detect a server port from logs (Node/Express servers)
      const handleNodeServerDetected = async (port: number) => {
        if (urlRef.current) return; // Already have a URL
        
        try {
          // Use WebContainer's port forwarding API
          const serverUrl = await webContainer.url(port);
          pushLog(`Detected Node server on port ${port}, forwarding to ${serverUrl}\n`);
          urlRef.current = serverUrl;
          setUrl(serverUrl);
        } catch (err) {
          console.error('Failed to forward port', err);
          // Fallback: try constructing URL manually
          const fallbackUrl = `http://localhost:${port}`;
          urlRef.current = fallbackUrl;
          setUrl(fallbackUrl);
        }
      };
      
      // Stream output and detect Node server from logs
      streamProcessOutput(devProcess, 'dev: ', handleNodeServerDetected);

      // listen for server-ready event (Vite/React dev servers auto-detect)
      const onServerReady = (port: number, serverUrl: string) => {
        if (!urlRef.current) {
          pushLog(`server-ready: ${serverUrl} (port ${port})\n`);
          urlRef.current = serverUrl;
          setUrl(serverUrl);
        }
      };
      // store handler so we can remove it on cleanup
      serverReadyRef.current = onServerReady;
      webContainer.on('server-ready', onServerReady);

      // optionally await dev exit if you want; usually dev stays running
      // await devProcess.exit;
    } catch (err: any) {
      console.error(err);
      setError(String(err));
    }
  }

  // Keep urlRef in sync with url state
  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  useEffect(() => {
    // reset installed flag whenever a new WebContainer instance appears
    installedRef.current = false;

    // start only when webcontainer instance is ready
    main();

    return () => {
      // cleanup server-ready listener to avoid duplicate handlers if PreviewFrame remounts
      try {
        if (serverReadyRef.current) {
          // some WebContainer versions expose `off`, others `removeListener`
          // try both defensively
          // @ts-ignore
          webContainer?.off?.('server-ready', serverReadyRef.current);
          // @ts-ignore
          webContainer?.removeListener?.('server-ready', serverReadyRef.current);
        }
      } catch (e) {
        // ignore cleanup errors
      }
      serverReadyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webContainer]);

  return (
    <div className="h-full flex flex-col text-gray-400">
      {!url && (
        <div className="flex-1 p-4">
          <div className="mb-2">{error ? <span className="text-red-400">{error}</span> : <span>Loading preview…</span>}</div>
          <div className="bg-black text-green-200 text-sm font-mono p-3 h-64 overflow-auto rounded">
            {logs.length === 0 && <div className="opacity-60">Waiting for output...</div>}
            {logs.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </div>
      )}

      {url && <iframe width={"100%"} height={"100%"} src={url} />}
    </div>
  );
}