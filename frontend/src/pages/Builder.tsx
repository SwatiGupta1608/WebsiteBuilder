import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { StepsList } from '../components/StepsList';
import { FileExplorer } from '../components/FileExplorer';
import { TabView } from '../components/TabView';
import { CodeEditor } from '../components/CodeEditor';
import { PreviewFrame } from '../components/PreviewFrame';
import { Step, FileItem, StepType } from '../types';
import axios from 'axios';
import { BACKEND_URL } from '../config';
import { parseXml } from '../steps';
import { useWebContainer } from '../hooks/useWebContainer';
import { Loader } from '../components/Loader';

type StreamState = {
  buffer: string;
  artifactAdded: boolean;
  emittedActions: number;
  combinedText: string;
};

export function Builder() {
  const location = useLocation();
  const { prompt } = location.state as { prompt: string };
  const [userPrompt, setPrompt] = useState("");
  const [llmMessages, setLlmMessages] = useState<{role: "user" | "assistant", content: string;}[]>([]);
  const [loading, setLoading] = useState(false);
  const [templateSet, setTemplateSet] = useState(false);
  const webcontainer = useWebContainer();

  const [currentStep, setCurrentStep] = useState(1);
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  
  const [steps, setSteps] = useState<Step[]>([]);

  const nextStepIdRef = useRef(1);
  const processedStepIdsRef = useRef<Set<number>>(new Set());
  const streamStateRef = useRef<StreamState>({
    buffer: '',
    artifactAdded: false,
    emittedActions: 0,
    combinedText: '',
  });

  const SAFE_NODE_DEPENDENCIES = useMemo(
    () =>
      new Set([
        'express',
        'cors',
        'dotenv',
        'axios',
        'uuid',
        'jsonwebtoken',
        'bcryptjs',
        'body-parser',
        'cookie-parser',
        'helmet',
        'compression',
        'morgan',
        'multer',
        'multer-memory-storage',
        'multer-s3',
        'multer-gridfs-storage',
        'pg',
        'pg-hstore',
        'pg-promise',
        'sequelize',
        'mysql2',
        'dayjs',
        'zod',
        'joi',
        'yup',
        'winston',
        'pino',
        'socket.io',
        'socket.io-client',
        'cache-manager',
        'ioredis',
        'bullmq',
        'nanoid',
        'cross-fetch',
        'node-fetch',
        '@aws-sdk/client-s3',
      ]),
    []
  );

  const SAFE_NODE_DEV_DEPENDENCIES = useMemo(
    () =>
      new Set([
        'nodemon',
        'typescript',
        'ts-node',
        'ts-node-dev',
        'eslint',
        'prettier',
        '@types/express',
        '@types/node',
        '@types/jsonwebtoken',
        '@types/bcryptjs',
        '@types/cookie-parser',
        '@types/morgan',
        '@types/joi',
        '@types/yup',
        '@types/uuid',
        'vitest',
        'supertest',
      ]),
    []
  );

  const DEFAULT_NODE_PACKAGE_JSON = useMemo(
    () =>
      `${JSON.stringify(
        {
          name: 'node-app',
          version: '1.0.0',
          private: true,
          scripts: {
            dev: 'node index.js',
            start: 'node index.js',
          },
          dependencies: {
            express: '^4.19.2',
          },
        },
        null,
        2
      )}\n`,
    []
  );

  const assignStepIds = useCallback((incomingSteps: Step[]) => {
    return incomingSteps.map((step) => ({
      ...step,
      id: nextStepIdRef.current++,
    }));
  }, []);

  const resetStreamState = useCallback(() => {
    streamStateRef.current = {
      buffer: '',
      artifactAdded: false,
      emittedActions: 0,
      combinedText: '',
    };
  }, []);

  const processStreamBuffer = useCallback(
    (isFinal = false) => {
      const state = streamStateRef.current;
      const stepsToAdd: Step[] = [];

      if (!state.artifactAdded) {
        const artifactMatch = state.buffer.match(/<boltArtifact[^>]*title="([^"]*)"/);
        if (artifactMatch) {
          const artifactTitle = artifactMatch[1] || 'Project Files';
          stepsToAdd.push({
            id: 0,
            title: artifactTitle,
            description: '',
            type: StepType.CreateFolder,
            status: 'in-progress',
          });
          state.artifactAdded = true;
        }
      }

      const actionRegex = /<boltAction\s+type="([^"]*)"(?:\s+filePath="([^"]*)")?>([\s\S]*?)<\/boltAction>/g;
      let match: RegExpExecArray | null;
      let totalMatches = 0;
      while ((match = actionRegex.exec(state.buffer)) !== null) {
        totalMatches += 1;
        if (totalMatches <= state.emittedActions) {
          continue;
        }

        const [, actionType, filePath, content] = match;
        const trimmedContent = (content || '').trim();

        if (actionType === 'file') {
          stepsToAdd.push({
            id: 0,
            title: `Create ${filePath || 'file'}`,
            description: '',
            type: StepType.CreateFile,
            status: 'pending',
            code: trimmedContent,
            path: filePath,
          });
        } else if (actionType === 'shell') {
          stepsToAdd.push({
            id: 0,
            title: 'Run command',
            description: '',
            type: StepType.RunScript,
            status: 'pending',
            code: trimmedContent,
          });
        }
      }

      if (totalMatches > state.emittedActions) {
        state.emittedActions = totalMatches;
      }

      if (stepsToAdd.length) {
        const stepsWithIds = assignStepIds(stepsToAdd);
        setSteps(prev => [...prev, ...stepsWithIds]);
        setCurrentStep(stepsWithIds[stepsWithIds.length - 1].id);
      }

      if (isFinal && state.artifactAdded) {
        setSteps(prev =>
          prev.map(step =>
            step.type === StepType.CreateFolder ? { ...step, status: 'completed' } : step
          )
        );
      }
    },
    [assignStepIds]
  );

  const handleStreamChunk = useCallback(
    (text: string) => {
      const state = streamStateRef.current;
      state.buffer += text;
      state.combinedText += text;
      processStreamBuffer(false);
    },
    [processStreamBuffer]
  );

  const streamChat = useCallback(
    async (messages: { role: "user" | "assistant"; content: string }[]) => {
      resetStreamState();

      const response = await fetch(`${BACKEND_URL}/chat?stream=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ messages }),
      });

      if (!response.ok) {
        throw new Error(`Chat request failed with status ${response.status}`);
      }

      const contentType = response.headers.get('Content-Type') || response.headers.get('content-type') || '';

      if (!contentType.includes('text/event-stream') || !response.body) {
        const payload = await response.json();
        const assistantText = payload.response ?? '';
        handleStreamChunk(assistantText);
        processStreamBuffer(true);
        return streamStateRef.current.combinedText;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let eventBuffer = '';
      let streamComplete = false;

      while (!streamComplete) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        eventBuffer += decoder.decode(value, { stream: true });

        let eventEndIndex: number;
        while ((eventEndIndex = eventBuffer.indexOf('\n\n')) !== -1) {
          const rawEvent = eventBuffer.slice(0, eventEndIndex).trim();
          eventBuffer = eventBuffer.slice(eventEndIndex + 2);

          const dataLines = rawEvent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('data:'));

          for (const line of dataLines) {
            try {
              const payload = JSON.parse(line.slice(5).trim());
              if (payload.type === 'chunk' && typeof payload.text === 'string') {
                handleStreamChunk(payload.text);
              } else if (payload.type === 'done') {
                streamComplete = true;
                break;
              } else if (payload.type === 'error') {
                throw new Error(payload.message || 'Streaming error');
              }
            } catch (err) {
              console.error('Failed to parse stream event', err);
            }
          }
        }
      }

      processStreamBuffer(true);

      return streamStateRef.current.combinedText;
    },
    [handleStreamChunk, processStreamBuffer, resetStreamState]
  );

  const sanitizeNodePackageJson = useCallback(
    (tree: FileItem[]) => {
      const packageFile = tree.find(
        (item) => item.type === 'file' && item.name === 'package.json'
      );
      if (!packageFile) {
        return tree;
      }

      let isValidNodeProject = false;
      let shouldReplace = false;

      try {
        if (!packageFile.content || !packageFile.content.trim()) {
          shouldReplace = true;
        } else {
          const pkg = JSON.parse(packageFile.content);
          const dependencies = pkg.dependencies ?? {};
          const devDependencies = pkg.devDependencies ?? {};

          const isReactProject =
            ('react' in dependencies || 'react' in devDependencies) &&
            ('react-dom' in dependencies || 'react-dom' in devDependencies);

          if (isReactProject) {
            return tree;
          }

          isValidNodeProject = true;
          let changed = false;

          const filterDeps = (entries: Record<string, string>, safeSet: Set<string>) => {
            const filtered: Record<string, string> = {};
            Object.entries(entries).forEach(([name, version]) => {
              if (safeSet.has(name)) {
                filtered[name] = version;
          } else {
                changed = true;
                console.warn(`Filtered out unsafe dependency: ${name}`);
              }
            });
            return filtered;
          };

          const filteredDeps = filterDeps(dependencies, SAFE_NODE_DEPENDENCIES);
          const filteredDevDeps = filterDeps(devDependencies, SAFE_NODE_DEV_DEPENDENCIES);

          if (pkg.type) {
            delete pkg.type;
            changed = true;
          }

          if (Object.keys(filteredDeps).length === 0) {
            filteredDeps['express'] = '^4.19.2';
            changed = true;
          }

          pkg.dependencies = filteredDeps;
          if (Object.keys(filteredDevDeps).length > 0) {
            pkg.devDependencies = filteredDevDeps;
          } else if (pkg.devDependencies) {
            delete pkg.devDependencies;
            changed = true;
          }

          pkg.scripts = {
            ...pkg.scripts,
            dev: pkg.scripts?.dev?.includes('node ') ? pkg.scripts.dev : 'node index.js',
            start: pkg.scripts?.start?.includes('node ') ? pkg.scripts.start : 'node index.js',
          };

          const sanitizedContent = `${JSON.stringify(pkg, null, 2)}\n`;
          if (changed || packageFile.content !== sanitizedContent) {
            packageFile.content = sanitizedContent;
          }
        }
      } catch (error) {
        console.warn('Failed to parse/sanitize package.json, replacing with default:', error);
        shouldReplace = true;
      }

      if (shouldReplace || !isValidNodeProject) {
        packageFile.content = DEFAULT_NODE_PACKAGE_JSON;
      }

      return tree;
    },
    [SAFE_NODE_DEPENDENCIES, SAFE_NODE_DEV_DEPENDENCIES, DEFAULT_NODE_PACKAGE_JSON]
  );

  const files = useMemo(() => {
    const nextFiles: FileItem[] = [];

    const insertIntoTree = (nodes: FileItem[], segments: string[], parentPath: string, content?: string) => {
      if (!segments.length) {
        return;
      }

      const [segment, ...rest] = segments;
      const currentPath = `${parentPath}/${segment}`.replace(/\/{2,}/g, '/');
      const existingNode = nodes.find((node) => node.name === segment);

      if (!rest.length) {
        if (existingNode && existingNode.type === 'file') {
          existingNode.content = content;
          existingNode.path = currentPath;
          return;
        }

        const fileNode: FileItem = {
          name: segment,
          type: 'file',
          path: currentPath,
          content,
        };

        if (existingNode) {
          const index = nodes.indexOf(existingNode);
          nodes.splice(index, 1, fileNode);
        } else {
          nodes.push(fileNode);
        }
        return;
      }

      let folderNode: FileItem;
      if (!existingNode || existingNode.type !== 'folder') {
        folderNode = {
          name: segment,
          type: 'folder',
          path: currentPath,
          children: [],
        };
        if (existingNode) {
          const index = nodes.indexOf(existingNode);
          nodes.splice(index, 1, folderNode);
        } else {
          nodes.push(folderNode);
        }
      } else {
        folderNode = existingNode;
        if (!folderNode.children) {
          folderNode.children = [];
        }
      }

      insertIntoTree(folderNode.children!, rest, currentPath, content);
    };

    steps.forEach((step) => {
      if (step.type === StepType.CreateFile && step.path) {
        const segments = step.path.split('/').filter(Boolean);
        if (segments.length) {
          insertIntoTree(nextFiles, segments, '', step.code);
        }
      }
    });
    const sanitized = sanitizeNodePackageJson(nextFiles);
    const hasPackageJson = sanitized.some(
      (item) => item.type === 'file' && item.name === 'package.json'
    );

    if (!hasPackageJson) {
      sanitized.push({
        name: 'package.json',
        type: 'file',
        path: '/package.json',
        content: DEFAULT_NODE_PACKAGE_JSON,
      });
    }

    return sanitized;
  }, [steps, sanitizeNodePackageJson, DEFAULT_NODE_PACKAGE_JSON]);

  useEffect(() => {
    const pendingCreateFileSteps = steps.filter(
      (step) =>
        step.status === 'pending' &&
        step.type === StepType.CreateFile &&
        step.path &&
        !processedStepIdsRef.current.has(step.id)
    );

    if (!pendingCreateFileSteps.length) {
      return;
    }

    const processedIds = new Set(processedStepIdsRef.current);
    pendingCreateFileSteps.forEach((step) => {
      processedIds.add(step.id);
    });
    processedStepIdsRef.current = processedIds;

    setSteps((prevSteps) =>
      prevSteps.map((step) =>
        processedIds.has(step.id) && step.type === StepType.CreateFile
          ? { ...step, status: 'completed' }
          : step
      )
    );
  }, [steps]);

  useEffect(() => {
    // Don't mount if WebContainer isn't ready or if we're still loading and no files exist
    if (!webcontainer || (loading && files.length === 0)) {
      return;
    }

    // Don't mount if we have steps but no corresponding files yet (streaming in progress)
    const hasPendingFileSteps = steps.some(
      (step) => step.type === StepType.CreateFile && step.status === 'pending'
    );
    
    // If we have pending file steps but no files, wait a bit more
    if (hasPendingFileSteps && files.length === 0) {
      return;
    }

    const createMountStructure = (files: FileItem[]): Record<string, any> => {
      const mountStructure: Record<string, any> = {};
  
      const processFile = (file: FileItem, isRootFolder: boolean) => {  
        if (file.type === 'folder') {
          // For folders, create a directory entry
          mountStructure[file.name] = {
            directory: file.children ? 
              Object.fromEntries(
                file.children.map(child => [child.name, processFile(child, false)])
              ) 
              : {}
          };
        } else if (file.type === 'file') {
          if (isRootFolder) {
            mountStructure[file.name] = {
              file: {
                contents: file.content || ''
              }
            };
          } else {
            // For files, create a file entry with contents
            return {
              file: {
                contents: file.content || ''
              }
            };
          }
        }
  
        return mountStructure[file.name];
      };
  
      // Process each top-level file/folder
      files.forEach(file => processFile(file, true));
  
      return mountStructure;
    };
  
    const mountStructure = createMountStructure(files);

    // Mount the structure if WebContainer is available
    // Debounce mounting so rapid file updates (from codegen) don't thrash the mount operation.
    console.log('Mounting WebContainer with structure:', mountStructure);
    const id = setTimeout(() => {
      if (webcontainer) {
        webcontainer.mount(mountStructure);
      }
    }, 500);

    return () => clearTimeout(id);
  }, [files, webcontainer, loading, steps]);

  async function init() {
    try {
    const response = await axios.post(`${BACKEND_URL}/template`, {
      prompt: prompt.trim()
    });
    setTemplateSet(true);
    
    const {prompts, uiPrompts} = response.data;

      nextStepIdRef.current = 1;
      processedStepIdsRef.current = new Set();

      const templateSteps = assignStepIds(parseXml(uiPrompts[0]).map((x: Step) => ({
      ...x,
      status: "pending"
    })));
      setSteps(templateSteps);
      if (templateSteps.length) {
        setCurrentStep(templateSteps[0].id);
      }

      const initialMessages = [...prompts, prompt].map(content => ({
        role: "user" as const,
        content
      }));

      setLlmMessages(initialMessages);

      setLoading(true);
      try {
        const assistantResponse = await streamChat(initialMessages);
        setLlmMessages(prev => [...prev, {role: "assistant" as const, content: assistantResponse}]);
      } finally {
        setLoading(false);
      }
    } catch (error) {
      console.error("Failed to initialise builder", error);
    setLoading(false);
    }
  }

  useEffect(() => {
    init();
  }, [])

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-100">Website Builder</h1>
        <p className="text-sm text-gray-400 mt-1">Prompt: {prompt}</p>
      </header>
      
      <div className="flex-1 overflow-hidden">
        <div className="h-full grid grid-cols-4 gap-6 p-6">
          <div className="col-span-1 space-y-6 overflow-auto">
            <div>
              <div className="max-h-[75vh] overflow-scroll">
                <StepsList
                  steps={steps}
                  currentStep={currentStep}
                  onStepClick={setCurrentStep}
                />
              </div>
              <div>
                <div className='flex'>
                  <br />
                  {(loading || !templateSet) && <Loader />}
                  {!(loading || !templateSet) && <div className='flex'>
                    <textarea value={userPrompt} onChange={(e) => {
                    setPrompt(e.target.value)
                  }} className='p-2 w-full'></textarea>
                  <button onClick={async () => {
                    if (!userPrompt.trim()) {
                      return;
                    }
                    const newMessage = {
                      role: "user" as const,
                      content: userPrompt
                    };

                    const conversation = [...llmMessages, newMessage];
                    setLlmMessages(conversation);
                    setLoading(true);
                    try {
                      const assistantResponse = await streamChat(conversation);
                      setLlmMessages(prev => [...prev, {
                      role: "assistant",
                        content: assistantResponse
                      }]);
                    } catch (error) {
                      console.error("Failed to stream chat", error);
                    } finally {
                      setLoading(false);
                    }
                    setPrompt('');
                  }} className='bg-purple-400 px-4'>Send</button>
                  </div>}
                </div>
              </div>
            </div>
          </div>
          <div className="col-span-1">
              <FileExplorer 
                files={files} 
                onFileSelect={setSelectedFile}
              />
            </div>
          <div className="col-span-2 bg-gray-900 rounded-lg shadow-lg p-4 h-[calc(100vh-8rem)]">
            <TabView activeTab={activeTab} onTabChange={setActiveTab} />
            <div className="h-[calc(100%-4rem)]">
              {activeTab === 'code' ? (
                <CodeEditor file={selectedFile} />
              ) : (
                <PreviewFrame webContainer={webcontainer} files={files} />
              )}
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}