/**
 * The full path of an app database, where `Context.openOrCreateDatabase(name)` keeps it.
 *
 * `@nativescript-community/sqlite` opens a bare name through
 * `Application.android.foregroundActivity || startActivity`, which is unset until the
 * activity exists: a node started at launch failed with "Cannot read properties of
 * undefined (reading 'openOrCreateDatabase')", depending on timing. A full path opens with
 * `SQLiteDatabase.openDatabase`, which needs no activity; the file is the same one.
 */
import { Utils } from '@nativescript/core';

export function dbPath(name: string): string {
  return Utils.android.getApplicationContext().getDatabasePath(name).getAbsolutePath();
}
