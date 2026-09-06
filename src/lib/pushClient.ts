import { getFirebaseAuth } from './firebase';

/** Ask the server to FCM-push parents (screen timer, etc.). Best-effort. */
export async function requestScreenTimerPush(input: {
  familyId: string;
  title: string;
  body: string;
  view?: string;
}): Promise<void> {
  try {
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    if (!user) return;
    const idToken = await user.getIdToken();
    await fetch('/api/push/screentimer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        familyId: input.familyId,
        title: input.title,
        body: input.body,
        view: input.view || 'dashboard',
      }),
    });
  } catch (e) {
    console.warn('requestScreenTimerPush failed', e);
  }
}
