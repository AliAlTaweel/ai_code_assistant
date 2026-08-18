INSERT INTO users (name, email, role) VALUES
  ('Ava Admin', 'ava.admin@agileday.local', 'ADMIN'),
  ('Ray Resourcing', 'ray.resourcing@agileday.local', 'RESOURCING_MANAGER'),
  ('Fiona Finance', 'fiona.finance@agileday.local', 'FINANCE');

WITH consultant_users AS (
  INSERT INTO users (name, email, role)
  VALUES
    ('Alice Chen', 'alice.chen@agileday.local', 'CONSULTANT'),
    ('Ben Osei', 'ben.osei@agileday.local', 'CONSULTANT'),
    ('Carla Reyes', 'carla.reyes@agileday.local', 'CONSULTANT'),
    ('Dev Patel', 'dev.patel@agileday.local', 'CONSULTANT'),
    ('Elin Svensson', 'elin.svensson@agileday.local', 'CONSULTANT'),
    ('Farid Haidari', 'farid.haidari@agileday.local', 'CONSULTANT'),
    ('Grace Kim', 'grace.kim@agileday.local', 'CONSULTANT'),
    ('Hugo Alvarez', 'hugo.alvarez@agileday.local', 'CONSULTANT'),
    ('Ines Moreau', 'ines.moreau@agileday.local', 'CONSULTANT'),
    ('Jonas Weber', 'jonas.weber@agileday.local', 'CONSULTANT')
  RETURNING id, name
),
consultant_rows AS (
  INSERT INTO consultants (user_id, full_name, title, hourly_cost_rate, availability_hours_per_week)
  SELECT consultant_users.id, consultant_users.name, profile.title, profile.cost, profile.hours FROM consultant_users
  JOIN (VALUES
    ('Alice Chen', 'Go Developer', 85.00, 30),
    ('Ben Osei', 'React Specialist', 75.00, 40),
    ('Carla Reyes', 'AI Engineer', 110.00, 20),
    ('Dev Patel', 'Backend Engineer (Node.js)', 80.00, 40),
    ('Elin Svensson', 'DevOps Engineer', 95.00, 25),
    ('Farid Haidari', 'Data Engineer', 90.00, 35),
    ('Grace Kim', 'Frontend Engineer (React)', 78.00, 40),
    ('Hugo Alvarez', 'Full-Stack Engineer', 88.00, 30),
    ('Ines Moreau', 'Machine Learning Engineer', 115.00, 20),
    ('Jonas Weber', 'Cloud Architect', 120.00, 15)
  ) AS profile(name, title, cost, hours) ON profile.name = consultant_users.name
  RETURNING id, full_name
)
INSERT INTO skills (consultant_id, skill_name, proficiency_level)
SELECT id, skill_name, proficiency_level FROM consultant_rows
JOIN (VALUES
  ('Alice Chen', 'Go', 5), ('Alice Chen', 'PostgreSQL', 4), ('Alice Chen', 'Kubernetes', 3),
  ('Ben Osei', 'React', 5), ('Ben Osei', 'TypeScript', 5), ('Ben Osei', 'Tailwind CSS', 4),
  ('Carla Reyes', 'Python', 5), ('Carla Reyes', 'PyTorch', 5), ('Carla Reyes', 'LLM Fine-Tuning', 4),
  ('Dev Patel', 'Node.js', 5), ('Dev Patel', 'PostgreSQL', 4), ('Dev Patel', 'REST APIs', 5),
  ('Elin Svensson', 'Docker', 5), ('Elin Svensson', 'CI/CD', 5), ('Elin Svensson', 'AWS', 4),
  ('Farid Haidari', 'SQL', 5), ('Farid Haidari', 'Apache Spark', 4), ('Farid Haidari', 'Airflow', 4),
  ('Grace Kim', 'React', 5), ('Grace Kim', 'CSS', 5), ('Grace Kim', 'Accessibility', 4),
  ('Hugo Alvarez', 'TypeScript', 4), ('Hugo Alvarez', 'React', 4), ('Hugo Alvarez', 'Node.js', 4),
  ('Ines Moreau', 'Python', 5), ('Ines Moreau', 'TensorFlow', 4), ('Ines Moreau', 'MLOps', 4),
  ('Jonas Weber', 'AWS', 5), ('Jonas Weber', 'Terraform', 5), ('Jonas Weber', 'Kubernetes', 5)
) AS sk(name, skill_name, proficiency_level) ON sk.name = consultant_rows.full_name;

INSERT INTO projects (client_name, project_name, target_bill_rate, required_skills, status) VALUES
  ('Northwind Logistics', 'Fleet Tracking Platform', 160.00, ARRAY['Go', 'PostgreSQL', 'Kubernetes'], 'ACTIVE'),
  ('Contoso Retail', 'Storefront Redesign', 150.00, ARRAY['React', 'TypeScript', 'Tailwind CSS'], 'PROSPECT'),
  ('Fabrikam Health', 'Clinical Notes Summarizer', 190.00, ARRAY['Python', 'LLM Fine-Tuning'], 'ACTIVE'),
  ('Globex Finance', 'Realtime Fraud Pipeline', 175.00, ARRAY['Apache Spark', 'SQL', 'Airflow'], 'PROSPECT'),
  ('Initech Cloud', 'Multi-Region Infra Migration', 200.00, ARRAY['AWS', 'Terraform', 'Kubernetes'], 'ACTIVE');
