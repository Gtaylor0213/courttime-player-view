/**
 * Public, signed .ics link used by the buttons in booking emails. The token in
 * the path (see bookingCalendarLinkService) stands in for a login.
 */
import express from 'express';
import { buildIcsEventContent, buildIcsFilename } from '../../shared/utils/bookingCalendar';
import {
  loadBookingCalendarLinkData,
  verifyBookingCalendarToken,
} from '../../src/services/bookingCalendarLinkService';

const router = express.Router();

router.get('/:bookingId/:token/calendar.ics', async (req, res, next) => {
  try {
    const { bookingId, token } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return res.status(404).send('Booking not found');
    const data = await loadBookingCalendarLinkData(bookingId);
    if (!data || !verifyBookingCalendarToken(bookingId, data.userId, token)) {
      return res.status(404).send('Booking not found');
    }
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${buildIcsFilename(data.details)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buildIcsEventContent(data.details));
  } catch (error) {
    next(error);
  }
});

export default router;
