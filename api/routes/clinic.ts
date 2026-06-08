import { Router, type Request, type Response } from 'express';
import { parseSession, requireRole } from '../middleware/role.js';
import * as svc from '../services/clinicService.js';
import type {
  CreateApplicationReq,
  CreateSlotReq,
  TriageReq,
  CancelAppointmentReq,
  RescheduleReq,
  RescheduleDecisionReq,
  CreateWaitlistReq,
  ConfirmWaitlistReq,
  AbandonWaitlistReq,
  WaitlistStatus,
  WaitlistUrgency,
} from '@shared/types';

const router = Router();
router.use(parseSession);

router.get('/doctors', (_req: Request, res: Response) => {
  res.json({ success: true, data: svc.listDoctors() });
});

router.get('/patients', (_req: Request, res: Response) => {
  res.json({ success: true, data: svc.listPatients() });
});

router.get('/slots', (req: Request, res: Response) => {
  const doctorId = req.query.doctorId ? Number(req.query.doctorId) : undefined;
  const date = req.query.date ? String(req.query.date) : undefined;
  res.json({ success: true, data: svc.listSlots({ doctorId, date }) });
});

router.post(
  '/slots',
  requireRole('doctor'),
  (req: Request, res: Response) => {
    const body = req.body as CreateSlotReq;
    const result = svc.createSlot(body, req.session!);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  },
);

router.get('/applications', (req: Request, res: Response) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const doctorId = req.query.doctorId ? Number(req.query.doctorId) : undefined;
  const patientId = req.query.patientId ? Number(req.query.patientId) : undefined;
  res.json({ success: true, data: svc.listApplications({ status, doctorId, patientId }) });
});

router.post(
  '/applications',
  requireRole('nurse', 'doctor'),
  (req: Request, res: Response) => {
    const body = req.body as CreateApplicationReq;
    const result = svc.createApplication(body, req.session!);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  },
);

router.post(
  '/applications/:id/triage',
  requireRole('nurse'),
  (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const body = req.body as TriageReq;
    const result = svc.triageApplication(id, body, req.session!);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  },
);

router.get('/appointments', (req: Request, res: Response) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const patientId = req.query.patientId ? Number(req.query.patientId) : undefined;
  const doctorId = req.query.doctorId ? Number(req.query.doctorId) : undefined;
  const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : undefined;
  const dateTo = req.query.dateTo ? String(req.query.dateTo) : undefined;
  res.json({
    success: true,
    data: svc.listAppointments({ status, patientId, doctorId, dateFrom, dateTo }),
  });
});

router.post('/appointments/:id/confirm', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const result = svc.confirmAppointment(id, req.session!);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.post('/appointments/:id/cancel', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const body = req.body as CancelAppointmentReq;
  const result = svc.cancelAppointment(id, body, req.session!);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.get('/appointments/:id/history', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  res.json({ success: true, data: svc.listAppointmentHistory(id) });
});

router.get('/reschedules', (req: Request, res: Response) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const patientId = req.query.patientId ? Number(req.query.patientId) : undefined;
  const appointmentId = req.query.appointmentId
    ? Number(req.query.appointmentId)
    : undefined;
  res.json({ success: true, data: svc.listReschedules({ status, patientId, appointmentId }) });
});

router.post(
  '/appointments/:id/reschedule',
  requireRole('nurse'),
  (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const body = req.body as RescheduleReq;
    const result = svc.initiateReschedule(id, body, req.session!);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  },
);

router.post('/reschedules/:id/accept', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const result = svc.acceptReschedule(id, req.session!);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.post('/reschedules/:id/reject', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const body = req.body as RescheduleDecisionReq;
  const result = svc.rejectReschedule(id, body, req.session!);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.get('/stats/overview', (_req: Request, res: Response) => {
  res.json({ success: true, data: svc.getOverviewStats() });
});

router.get('/export/csv', (req: Request, res: Response) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : undefined;
  const dateTo = req.query.dateTo ? String(req.query.dateTo) : undefined;
  const csv = svc.exportAppointmentsCsv({ status, dateFrom, dateTo });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="appointments_${Date.now()}.csv"`,
  );
  res.send(csv);
});

router.get('/export/json', (req: Request, res: Response) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : undefined;
  const dateTo = req.query.dateTo ? String(req.query.dateTo) : undefined;
  const json = svc.exportAppointmentsJson({ status, dateFrom, dateTo });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="appointments_${Date.now()}.json"`,
  );
  res.send(json);
});

router.get('/waitlists', (req: Request, res: Response) => {
  const status = req.query.status ? (String(req.query.status) as WaitlistStatus) : undefined;
  const patientId = req.query.patientId ? Number(req.query.patientId) : undefined;
  const department = req.query.department ? String(req.query.department) : undefined;
  const doctorId = req.query.doctorId ? Number(req.query.doctorId) : undefined;
  const urgency = req.query.urgency ? (String(req.query.urgency) as WaitlistUrgency) : undefined;
  res.json({
    success: true,
    data: svc.listWaitlists({ status, patientId, department, doctorId, urgency }),
  });
});

router.get('/waitlists/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = svc.getWaitlist(id);
  if (!data) {
    res.status(404).json({ success: false, error: '候补记录不存在' });
    return;
  }
  res.json({ success: true, data });
});

router.get('/waitlists/:id/logs', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  res.json({ success: true, data: svc.listWaitlistLogs(id) });
});

router.post('/waitlists', requireRole('nurse'), (req: Request, res: Response) => {
  const body = req.body as CreateWaitlistReq;
  const result = svc.createWaitlist(body, req.session!);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.get('/waitlists/match/all', requireRole('nurse'), (_req: Request, res: Response) => {
  res.json({ success: true, data: svc.matchAllWaitlists() });
});

router.get('/waitlists/match/slot/:slotId', requireRole('nurse'), (req: Request, res: Response) => {
  const slotId = Number(req.params.slotId);
  res.json({ success: true, data: svc.matchWaitlistForSlot(slotId) });
});

router.post('/waitlists/:id/confirm', requireRole('nurse'), (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const body = req.body as ConfirmWaitlistReq;
  const result = svc.confirmWaitlist(id, body, req.session!);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

router.post('/waitlists/:id/abandon', requireRole('nurse'), (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const body = req.body as AbandonWaitlistReq;
  const result = svc.abandonWaitlist(id, body, req.session!);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

export default router;
