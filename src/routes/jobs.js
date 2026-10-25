export function registerJobsRoutes(app, { store, db }) {
  app.delete('/api/jobs', (req, res) => {
    const before = db.jobs.length;
    db.jobs = db.jobs.filter(j => ['queued', 'running'].includes(j.status));
    store.save();
    res.json({ deleted: before - db.jobs.length });
  });
}
