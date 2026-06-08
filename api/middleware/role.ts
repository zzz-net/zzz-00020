import type { Request, Response, NextFunction } from 'express';
import type { UserRole, RoleSession } from '@shared/types';

declare global {
  namespace Express {
    interface Request {
      session?: RoleSession;
    }
  }
}

export function parseSession(req: Request, _res: Response, next: NextFunction) {
  const roleHeader = req.headers['x-user-role'] as string | undefined;
  const nameHeader = req.headers['x-user-name'] as string | undefined;
  const doctorIdHeader = req.headers['x-doctor-id'] as string | undefined;
  const patientIdHeader = req.headers['x-patient-id'] as string | undefined;

  const role = (roleHeader || 'nurse') as UserRole;
  let name = nameHeader || '系统管理员';
  try {
    name = decodeURIComponent(name);
  } catch {
    // ignore decode errors
  }

  req.session = {
    role,
    name,
    doctorId: doctorIdHeader ? parseInt(doctorIdHeader, 10) : undefined,
    patientId: patientIdHeader ? parseInt(patientIdHeader, 10) : undefined,
  };
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session || !roles.includes(req.session.role)) {
      res.status(403).json({
        success: false,
        error: `无权访问，需要角色: ${roles.join(', ')}`,
      });
      return;
    }
    next();
  };
}
