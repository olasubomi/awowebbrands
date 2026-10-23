# Consultation form entry points

The homepage Consultation navigation link and Request a consultation button open `/consultation`, the tested service inquiry form. The homepage button uses the same green/navy visual palette with a visible keyboard focus state. About and Testimonials use same-site links.

The service catalog also links to this form and carries the selected service in the query string. The catalog action says Request a consultation; a submission does not book an appointment.

Existing `/awo_form` and `/awo_form/` bookmarks continue serving the new form through the existing server aliases. Other form types, account creation, and newsletter subscriptions are outside this update. No database changes are required.
