export type SampleSchema = {
  slug: string;
  name: string;
  description: string;
  ddl: string;
  seed: string;
  exampleQuestions: string[];
};

export const SAMPLE_SCHEMAS: SampleSchema[] = [
  {
    slug: "ecommerce",
    name: "E-commerce",
    description: "Customers, products, orders, and order items.",
    ddl: `CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  country TEXT,
  created_at DATE
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  price REAL NOT NULL,
  stock INTEGER
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  order_date DATE NOT NULL,
  total REAL NOT NULL,
  status TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);`,
    seed: `INSERT INTO customers VALUES
  (1, 'Alice Chen', 'alice@example.com', 'USA', '2024-01-15'),
  (2, 'Bob Kumar', 'bob@example.com', 'India', '2024-02-20'),
  (3, 'Carla Rossi', 'carla@example.com', 'Italy', '2024-03-05'),
  (4, 'David Kim', 'david@example.com', 'USA', '2024-04-11'),
  (5, 'Elena Petrov', 'elena@example.com', 'Germany', '2024-05-22');

INSERT INTO products VALUES
  (1, 'Wireless Mouse', 'Electronics', 29.99, 150),
  (2, 'Mechanical Keyboard', 'Electronics', 89.99, 75),
  (3, 'Coffee Mug', 'Home', 12.50, 300),
  (4, 'Desk Lamp', 'Home', 45.00, 60),
  (5, 'Notebook', 'Office', 8.99, 500),
  (6, 'Standing Desk', 'Furniture', 399.00, 20);

INSERT INTO orders VALUES
  (1, 1, '2025-01-10', 119.98, 'shipped'),
  (2, 2, '2025-01-12', 12.50, 'delivered'),
  (3, 1, '2025-02-01', 45.00, 'delivered'),
  (4, 3, '2025-02-15', 488.99, 'shipped'),
  (5, 4, '2025-03-03', 17.98, 'pending'),
  (6, 5, '2025-03-20', 89.99, 'delivered'),
  (7, 2, '2025-04-01', 399.00, 'shipped');

INSERT INTO order_items VALUES
  (1, 1, 1, 1, 29.99),
  (2, 1, 2, 1, 89.99),
  (3, 2, 3, 1, 12.50),
  (4, 3, 4, 1, 45.00),
  (5, 4, 2, 1, 89.99),
  (6, 4, 6, 1, 399.00),
  (7, 5, 5, 2, 8.99),
  (8, 6, 2, 1, 89.99),
  (9, 7, 6, 1, 399.00);`,
    exampleQuestions: [
      "Top 3 customers by total spend",
      "Which product category has the highest revenue?",
      "List all orders from the USA with more than one item",
      "Average order value per country",
    ],
  },
  {
    slug: "hr",
    name: "HR / Employees",
    description: "Departments and employees with salaries and roles.",
    ddl: `CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT
);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  department_id INTEGER,
  role TEXT,
  salary REAL NOT NULL,
  hired_at DATE,
  manager_id INTEGER,
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (manager_id) REFERENCES employees(id)
);`,
    seed: `INSERT INTO departments VALUES
  (1, 'Engineering', 'San Francisco'),
  (2, 'Sales', 'New York'),
  (3, 'Marketing', 'London'),
  (4, 'HR', 'San Francisco');

INSERT INTO employees VALUES
  (1, 'Sarah Johnson', 1, 'VP Engineering', 220000, '2020-03-15', NULL),
  (2, 'Mike Chen', 1, 'Senior Engineer', 165000, '2021-06-10', 1),
  (3, 'Priya Patel', 1, 'Engineer', 130000, '2022-09-01', 1),
  (4, 'James Wilson', 1, 'Engineer', 125000, '2023-01-20', 1),
  (5, 'Rachel Adams', 2, 'VP Sales', 210000, '2019-11-05', NULL),
  (6, 'Tom Garcia', 2, 'Account Executive', 95000, '2022-02-14', 5),
  (7, 'Lisa Wong', 2, 'Account Executive', 92000, '2023-07-19', 5),
  (8, 'Daniel Schmidt', 3, 'Marketing Manager', 115000, '2021-10-03', NULL),
  (9, 'Maria Gonzalez', 3, 'Content Writer', 78000, '2023-04-11', 8),
  (10, 'Kevin Brown', 4, 'HR Director', 140000, '2020-08-22', NULL);`,
    exampleQuestions: [
      "Average salary by department",
      "Employees hired in 2023",
      "Who reports to Sarah Johnson?",
      "Top 3 highest paid employees",
    ],
  },
  {
    slug: "blog",
    name: "Blog",
    description: "Users, posts, and comments for a content site.",
    ddl: `CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  joined_at DATE
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  published_at DATE,
  views INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at DATE,
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);`,
    seed: `INSERT INTO users VALUES
  (1, 'techwriter', 'tw@blog.com', '2024-01-01'),
  (2, 'devgirl', 'dg@blog.com', '2024-02-15'),
  (3, 'codemonk', 'cm@blog.com', '2024-03-20'),
  (4, 'bytewise', 'bw@blog.com', '2024-05-10');

INSERT INTO posts VALUES
  (1, 1, 'Getting Started with RAG', 'Retrieval Augmented Generation is...', '2025-01-10', 4200),
  (2, 2, 'Vector Databases Explained', 'A vector database stores...', '2025-01-18', 3100),
  (3, 1, 'Prompt Engineering Tips', 'Good prompts are...', '2025-02-02', 5600),
  (4, 3, 'LangChain vs LlamaIndex', 'Both frameworks aim...', '2025-02-14', 2800),
  (5, 2, 'Fine-tuning on a Budget', 'LoRA lets you...', '2025-03-01', 1900),
  (6, 4, 'Embedding Models Compared', 'We benchmarked...', '2025-03-15', 950);

INSERT INTO comments VALUES
  (1, 1, 2, 'Great intro!', '2025-01-11'),
  (2, 1, 3, 'How does chunking affect this?', '2025-01-12'),
  (3, 1, 4, 'Very helpful, thanks', '2025-01-14'),
  (4, 3, 2, 'The few-shot example helped a lot', '2025-02-03'),
  (5, 3, 3, 'Any tips for JSON mode?', '2025-02-05'),
  (6, 3, 4, 'Bookmarked', '2025-02-06'),
  (7, 2, 1, 'Nice comparison of pgvector', '2025-01-19'),
  (8, 4, 1, 'I prefer LangChain for flexibility', '2025-02-15');`,
    exampleQuestions: [
      "Most viewed post",
      "Users with the most comments",
      "Posts with more than 2 comments",
      "Monthly post count",
    ],
  },
];

export function getSchemaBySlug(slug: string): SampleSchema | undefined {
  return SAMPLE_SCHEMAS.find((s) => s.slug === slug);
}
