import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { findFileByName, readJsonFile, saveJsonFile, ensureFolder } from '@/lib/drive';
import { AiTask } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function getTasksFolder(rootId: string): Promise<string> {
  return ensureFolder('tasks', rootId);
}

async function loadTasks(tasksFolderId: string): Promise<AiTask[]> {
  const file = await findFileByName('tasks.json', tasksFolderId);
  if (!file?.id) return [];
  try {
    return await readJsonFile<AiTask[]>(file.id);
  } catch {
    return [];
  }
}

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.is_admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not set' }, { status: 500 });

    const tasksFolderId = await getTasksFolder(rootId);
    const tasks = await loadTasks(tasksFolderId);
    return NextResponse.json(tasks);
  } catch (error) {
    console.error('GET /api/admin/tasks error:', error);
    return NextResponse.json({ error: 'Failed to load tasks' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.is_admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { texts, survey_id } = body as { texts: string[]; survey_id: string };

    if (!Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json({ error: 'texts is required' }, { status: 400 });
    }
    if (texts.length > 20) {
      return NextResponse.json({ error: 'Too many tasks' }, { status: 400 });
    }

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not set' }, { status: 500 });

    const tasksFolderId = await getTasksFolder(rootId);
    const existing = await loadTasks(tasksFolderId);

    const now = new Date().toISOString();
    const newTasks: AiTask[] = texts.map((text, i) => ({
      id: `${Date.now()}-${i}`,
      text: String(text).slice(0, 200),
      survey_id: String(survey_id || '').slice(0, 20),
      created_at: now,
      status: 'pending',
    }));

    const updated = [...existing, ...newTasks];

    const existingFile = await findFileByName('tasks.json', tasksFolderId);
    await saveJsonFile(updated, 'tasks.json', tasksFolderId, existingFile?.id ?? undefined);

    return NextResponse.json({ saved: newTasks.length });
  } catch (error) {
    console.error('POST /api/admin/tasks error:', error);
    return NextResponse.json({ error: 'Failed to save tasks' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.is_admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id, status } = body as { id: string; status: 'pending' | 'done' };
    if (!id || !['pending', 'done'].includes(status)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const rootId = process.env.APP_DATA_ROOT_FOLDER_ID;
    if (!rootId) return NextResponse.json({ error: 'APP_DATA_ROOT_FOLDER_ID not set' }, { status: 500 });

    const tasksFolderId = await getTasksFolder(rootId);
    const tasks = await loadTasks(tasksFolderId);
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    tasks[idx] = { ...tasks[idx], status };
    const existingFile = await findFileByName('tasks.json', tasksFolderId);
    await saveJsonFile(tasks, 'tasks.json', tasksFolderId, existingFile?.id ?? undefined);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/admin/tasks error:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}
